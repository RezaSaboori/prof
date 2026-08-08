from urllib.parse import urlparse

from django import template

register = template.Library()

JOB_BOARD_DOMAINS = frozenset({'linkedin.com'})


@register.filter
def company_logo_url(url):
    if not url:
        return ''
    domain = urlparse(url).netloc.lower()
    if domain.startswith('www.'):
        domain = domain[4:]
    if not domain or domain in JOB_BOARD_DOMAINS:
        return ''
    return f'https://logo.clearbit.com/{domain}'