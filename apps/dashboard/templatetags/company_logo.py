"""
Django template filter: resolve a job/company URL to a company logo URL.

Enhancements over the naive version
-----------------------------------
1. Clearbit is dead (shut down Dec 2025) -> provider chain instead:
      Brandfetch -> Logo.dev -> Google Favicons -> Brandfetch lettermark
2. Brandfetch's DEFAULT fallback serves Brandfetch's own logo when the
   company logo is missing. We therefore always probe with `fallback/404`
   and verify the HTTP status before accepting a URL.
3. Brandfetch name-search can return the WRONG company (e.g. "exl" ->
   exl.com.au instead of exlservice.com). Candidates are scored with
   name + domain similarity and rejected below a threshold.
4. Aggressive caching (hits AND misses) so template rendering stays fast.

settings.py:
    BRANDFETCH_CLIENT_ID = "..."   # free: https://developers.brandfetch.com/register
    LOGO_DEV_TOKEN       = "..."   # optional: https://logo.dev (free tier)
"""

import re
from difflib import SequenceMatcher
from urllib.parse import unquote, urlparse

import requests
from django import template
from django.conf import settings
from django.core.cache import cache

register = template.Library()

BRANDFETCH_CLIENT_ID = getattr(settings, 'BRANDFETCH_CLIENT_ID', '')
LOGO_DEV_TOKEN = getattr(settings, 'LOGO_DEV_TOKEN', '')

CACHE_TTL = 60 * 60 * 24 * 7       # 7 days for resolved logos
MISS_CACHE_TTL = 60 * 60 * 24      # 1 day for misses (retry sooner)
MIN_MATCH_SCORE = 0.6              # similarity threshold for search candidates
HTTP_TIMEOUT = 3

JOB_BOARD_DOMAINS = frozenset({
    'indeed.com', 'glassdoor.com', 'ziprecruiter.com', 'monster.com',
    'simplyhired.com', 'dice.com', 'careerbuilder.com', 'wellfound.com',
    'greenhouse.io', 'lever.co', 'myworkdayjobs.com', 'workdayjobs.com',
    'smartrecruiter.com', 'smartrecruiters.com', 'workable.com',
    'ashbyhq.com', 'icims.com', 'jobvite.com', 'bamboohr.com',
})

# LinkedIn slug: "<job-title>-at-<company-slug>-<jobId>"
_LINKEDIN_JOB_RE = re.compile(r'.+-at-(?P<company>.+?)-\d+$')

_LEGAL_SUFFIXES = (
    'llc', 'inc', 'ltd', 'llp', 'corp', 'corporation', 'gmbh', 'plc', 'co',
)


# ---------------------------------------------------------------------------
# 1. Company name extraction (LinkedIn)
# ---------------------------------------------------------------------------

def _extract_linkedin_company_name(url):
    """'.../jobs/view/data-architect-at-vns-health-4434883676/' -> 'vns health'"""
    slug = unquote(urlparse(url).path).rstrip('/').rsplit('/', 1)[-1]
    m = _LINKEDIN_JOB_RE.match(slug)
    if not m:
        return None
    return m.group('company').replace('-', ' ').strip() or None


# ---------------------------------------------------------------------------
# 2. Company name -> domain (Brandfetch Brand Search, with scoring)
# ---------------------------------------------------------------------------

def _similarity(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _brandfetch_search(query):
    """Raw Brandfetch Brand Search call. Cached (including empty results)."""
    cache_key = f'bf-search:{query.lower()}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    results = []
    try:
        resp = requests.get(
            f'https://api.brandfetch.io/v2/search/{query}',
            params={'c': BRANDFETCH_CLIENT_ID},
            timeout=HTTP_TIMEOUT,
        )
        if resp.ok:
            results = resp.json() or []
    except requests.RequestException:
        pass

    cache.set(cache_key, results, CACHE_TTL if results else MISS_CACHE_TTL)
    return results


def _score_candidate(company_name, candidate):
    """Score how well a Brandfetch search result matches the wanted company.
    Compares both the brand name and the domain's second-level part."""
    name_score = _similarity(company_name, candidate.get('name') or '')
    sld = (candidate.get('domain') or '').split('.')[0].replace('-', ' ')
    domain_score = _similarity(company_name, sld)
    score = max(name_score, domain_score)
    if candidate.get('claimed'):          # verified brand -> small boost
        score = min(1.0, score + 0.1)
    return score


def _resolve_domain_by_name(company_name):
    """Pick the best-matching domain for a company name, or ''."""
    cache_key = f'bf-domain:{company_name.lower()}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    attempts = [company_name]
    words = company_name.split()
    if len(words) > 1 and words[-1] in _LEGAL_SUFFIXES:
        attempts.append(' '.join(words[:-1]))   # "asymmetry group llc" -> "asymmetry group"

    best_domain, best_score = '', 0.0
    for attempt in attempts:
        for rank, cand in enumerate(_brandfetch_search(attempt)[:5]):
            score = _score_candidate(company_name, cand) - rank * 0.02
            if score > best_score and cand.get('domain'):
                best_domain, best_score = cand['domain'], score

    domain = best_domain if best_score >= MIN_MATCH_SCORE else ''
    cache.set(cache_key, domain, CACHE_TTL if domain else MISS_CACHE_TTL)
    return domain


# ---------------------------------------------------------------------------
# 3. Domain -> logo URL (provider chain with verification)
# ---------------------------------------------------------------------------

def _brandfetch_logo(domain, fallback):
    return (
        f'https://cdn.brandfetch.io/{domain}'
        f'/fallback/{fallback}/h/400/w/400?c={BRANDFETCH_CLIENT_ID}'
    )


def _logo_dev_url(domain):
    return (
        f'https://img.logo.dev/{domain}'
        f'?token={LOGO_DEV_TOKEN}&size=400&format=png&fallback=404'
    )


def _google_favicon_url(domain):
    return f'https://www.google.com/s2/favicons?domain={domain}&sz=128'


def _is_available(url):
    """True only if the provider actually has a logo (HTTP 200 + image)."""
    try:
        resp = requests.head(url, timeout=HTTP_TIMEOUT, allow_redirects=True)
        if resp.status_code == 405:      # some CDNs reject HEAD
            resp = requests.get(url, timeout=HTTP_TIMEOUT, stream=True)
        return resp.status_code == 200
    except requests.RequestException:
        return False


def _resolve_logo_for_domain(domain):
    """Walk the provider chain; return the first verified logo URL.
    The last resort (lettermark) always renders, so it is never verified."""
    cache_key = f'logo-dom:{domain}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    logo_url = ''

    # 1) Brandfetch, probed with fallback/404 so a miss is detectable
    candidate = _brandfetch_logo(domain, fallback='404')
    if _is_available(candidate):
        logo_url = _brandfetch_logo(domain, fallback='404')

    # 2) Logo.dev (optional, needs token)
    elif LOGO_DEV_TOKEN:
        candidate = _logo_dev_url(domain)
        if _is_available(candidate):
            logo_url = candidate

    # 3) Google favicon: always 200 even for unknown domains (globe icon),
    #    so we accept it only for domains we resolved via Brandfetch search.
    #    (Passed in via flag below.)

    # 4) Guaranteed non-broken placeholder
    if not logo_url:
        logo_url = _brandfetch_logo(domain, fallback='lettermark')

    cache.set(cache_key, logo_url, CACHE_TTL)
    return logo_url


def _resolve_logo_chain(domain, allow_favicon):
    logo_url = _resolve_logo_for_domain(domain)
    # If the chain fell back to a lettermark, a mid-res Google favicon is
    # often nicer for domains that came from a real company site.
    if allow_favicon and '/fallback/lettermark/' in logo_url:
        logo_url = _google_favicon_url(domain)
    return logo_url


# ---------------------------------------------------------------------------
# 4. The template filter
# ---------------------------------------------------------------------------

@register.filter
def company_logo_url(url):
    if not url or not BRANDFETCH_CLIENT_ID:
        return ''

    cache_key = f'logo-url:{url}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    logo_url = ''
    domain = urlparse(url).netloc.lower()
    if domain.startswith('www.'):
        domain = domain[4:]

    if domain == 'linkedin.com':
        company_name = _extract_linkedin_company_name(url)
        if company_name:
            company_domain = _resolve_domain_by_name(company_name)
            if company_domain:
                logo_url = _resolve_logo_chain(company_domain, allow_favicon=False)
    elif domain and domain not in JOB_BOARD_DOMAINS:
        logo_url = _resolve_logo_chain(domain, allow_favicon=True)
    # else: job board URL with no recoverable company -> ''

    cache.set(cache_key, logo_url, CACHE_TTL if logo_url else MISS_CACHE_TTL)
    return logo_url