"""
Company logo resolution service.

Architecture
------------
Template rendering and the logo API never perform HTTP synchronously.

    get_logo(url)  →  (status, logo_url)
        status == 'resolved'    → logo_url is ready to render
        status == 'pending'     → resolution queued in the background
        status == 'unavailable' → no logo exists; keep the letter fallback

Layers:
    L1  Django cache (hot rows, per-process)
    L2  CompanyLogo DB model (durable, shared between gunicorn workers)
    BG  ThreadPoolExecutor warms misses through the provider chain
        (Brandfetch → Logo.dev → Google Favicons → lettermark)

Smart retention:
    • Hits are counted hourly-debounced (hit_count / last_requested_at).
    • Resolved logos are re-verified after RESOLVED_REFRESH_DAYS
      (stale-while-revalidate: the old URL is served meanwhile).
    • Misses are retried after MISS_CACHE_TTL, not on every render.
    • `cleanup_company_logos` evicts old, rarely-used rows so a very old
      logo never slows the store down again.

Cache keys built from free text (company names contain spaces) are MD5-
hashed via _hashed_key() so the store stays memcached/Redis-safe.

Celery seam: if a broker is added later, replace `_executor.submit(...)`
in `_enqueue()` with a task call — nothing else changes.
"""

import hashlib
import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from difflib import SequenceMatcher
from urllib.parse import unquote, urlparse

import requests
from django.conf import settings
from django.core.cache import cache
from django.db.models import F
from django.utils import timezone

from apps.dashboard.models import CompanyLogo

logger = logging.getLogger(__name__)

BRANDFETCH_CLIENT_ID = getattr(settings, 'BRANDFETCH_CLIENT_ID', '')
LOGO_DEV_TOKEN = getattr(settings, 'LOGO_DEV_TOKEN', '')

CACHE_TTL = 60 * 60 * 24 * 7       # 7 days for resolved logos (L1)
MISS_CACHE_TTL = 60 * 60 * 24      # 1 day before a miss is retried
RESOLVED_REFRESH_DAYS = 30         # re-verify old logos (stale-while-revalidate)
PENDING_REQUEUE_MINUTES = 10       # re-enqueue if a worker died mid-resolution
MIN_MATCH_SCORE = 0.6              # similarity threshold for search candidates
HTTP_TIMEOUT = 3
TOUCH_DEBOUNCE_SECONDS = 60 * 60   # hit_count written at most once/hour/key

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

# Bounded background resolver + in-flight dedupe (prevents stampedes when
# many cards share one domain and across concurrent gunicorn requests).
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix='logo-warm')
_inflight = set()
_inflight_lock = threading.Lock()


def _hashed_key(prefix, raw):
    """Memcached/Redis-safe cache key for free-text values (names have spaces)."""
    digest = hashlib.md5(raw.encode('utf-8')).hexdigest()
    return f'{prefix}:{digest}'


# ---------------------------------------------------------------------------
# 1. Provider chain (moved from templatetags — logic unchanged)
# ---------------------------------------------------------------------------

def _extract_linkedin_company_name(url):
    """'.../jobs/view/data-architect-at-vns-health-4434883676/' -> 'vns health'"""
    slug = unquote(urlparse(url).path).rstrip('/').rsplit('/', 1)[-1]
    m = _LINKEDIN_JOB_RE.match(slug)
    if not m:
        return None
    return m.group('company').replace('-', ' ').strip() or None


def _similarity(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _brandfetch_search(query):
    """Raw Brandfetch Brand Search call. Cached (including empty results)."""
    cache_key = _hashed_key('bf-search', query.lower())
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
    cache_key = _hashed_key('bf-domain', company_name.lower())
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
# 2. URL normalisation
# ---------------------------------------------------------------------------

def _normalize_target(url):
    """-> (kind, lookup_key); ('', '') when nothing is resolvable."""
    domain = urlparse(url).netloc.lower()
    if domain.startswith('www.'):
        domain = domain[4:]

    if domain == 'linkedin.com':
        company_name = _extract_linkedin_company_name(url)
        if company_name:
            return CompanyLogo.Kind.NAME, company_name.lower()
        return '', ''

    if domain and domain not in JOB_BOARD_DOMAINS:
        return CompanyLogo.Kind.DOMAIN, domain

    return '', ''


# ---------------------------------------------------------------------------
# 3. Store: read-through (L1 cache -> L2 DB) + frequency tracking
# ---------------------------------------------------------------------------

def _cache_key(key):
    return _hashed_key('logo-v2', key)


def _touch(key):
    """Hourly-debounced hit counter — keeps frequency stats cheap."""
    if not cache.add(f'{_cache_key(key)}#touched', 1, TOUCH_DEBOUNCE_SECONDS):
        return
    CompanyLogo.objects.filter(lookup_key=key).update(
        hit_count=F('hit_count') + 1,
        last_requested_at=timezone.now(),
    )


def _enqueue(kind, key):
    """Queue background resolution; in-flight set dedupes concurrent requests."""
    with _inflight_lock:
        if key in _inflight:
            return
        _inflight.add(key)
    _executor.submit(_resolve_and_store, kind, key)


def _resolve_and_store(kind, key):
    try:
        if kind == CompanyLogo.Kind.NAME:
            domain = _resolve_domain_by_name(key)
            logo_url = _resolve_logo_chain(domain, allow_favicon=False) if domain else ''
        else:
            logo_url = _resolve_logo_chain(key, allow_favicon=True)

        CompanyLogo.objects.filter(lookup_key=key).update(
            logo_url=logo_url,
            status=CompanyLogo.Status.RESOLVED,
            resolved_at=timezone.now(),
        )
        cache.set(_cache_key(key), logo_url, CACHE_TTL if logo_url else MISS_CACHE_TTL)
    except Exception:
        # Provider/network hard failure: row stays PENDING and is re-queued
        # after PENDING_REQUEUE_MINUTES — the letter fallback stays visible.
        logger.exception('Company logo resolution failed for %s', key)
    finally:
        with _inflight_lock:
            _inflight.discard(key)


def get_logo(url):
    """Non-blocking read. Returns (status, logo_url)."""
    if not url or not BRANDFETCH_CLIENT_ID:
        return ('unavailable', '')

    kind, key = _normalize_target(url)
    if not key:
        return ('unavailable', '')

    # L1: hot rows (hit or miss) served without touching the DB
    cache_key = _cache_key(key)
    cached = cache.get(cache_key)
    if cached is not None:
        _touch(key)
        return ('resolved', cached) if cached else ('unavailable', '')

    now = timezone.now()
    row = CompanyLogo.objects.filter(lookup_key=key).first()

    # First time this target is ever seen
    if row is None:
        CompanyLogo.objects.get_or_create(
            lookup_key=key,
            defaults={'kind': kind, 'status': CompanyLogo.Status.PENDING},
        )
        _touch(key)
        _enqueue(kind, key)
        return ('pending', '')

    _touch(key)

    # Still resolving (or a previous worker died mid-resolution)
    if row.status == CompanyLogo.Status.PENDING:
        if now - row.first_requested_at > timedelta(minutes=PENDING_REQUEUE_MINUTES):
            _enqueue(kind, key)
        return ('pending', '')

    # RESOLVED with a logo: serve it; refresh in background when stale
    if row.logo_url:
        if row.resolved_at and now - row.resolved_at > timedelta(days=RESOLVED_REFRESH_DAYS):
            _enqueue(kind, key)   # stale-while-revalidate
        cache.set(cache_key, row.logo_url, CACHE_TTL)
        return ('resolved', row.logo_url)

    # RESOLVED as a definitive miss: retry the chain after MISS_CACHE_TTL
    if row.resolved_at is None or now - row.resolved_at > timedelta(seconds=MISS_CACHE_TTL):
        _enqueue(kind, key)
        return ('pending', '')

    cache.set(cache_key, '', MISS_CACHE_TTL)
    return ('unavailable', '')