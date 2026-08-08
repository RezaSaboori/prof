from urllib.parse import urlparse

from django import template

register = template.Library()


@register.filter
def company_logo_url(url):
    if not url:
        return ''
    domain = urlparse(url).netloc.lower()
    if domain.startswith('www.'):
        domain = domain[4:]
    if not domain:
        return ''
    return f'https://logo.clearbit.com/{domain}'