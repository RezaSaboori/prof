"""
Template filter: resolve a job/company URL to a company logo URL.

Thin, non-blocking wrapper around apps.dashboard.services.company_logo.
Never performs HTTP during template rendering: returns the stored logo
URL when one is already resolved, otherwise '' (the caller template
shows the letter fallback while the logo resolves in the background).
"""

from django import template

from apps.dashboard.services import logo_service

register = template.Library()


@register.filter
def company_logo_url(url):
    status, logo_url = logo_service.get_logo(url)
    return logo_url if status == 'resolved' else ''