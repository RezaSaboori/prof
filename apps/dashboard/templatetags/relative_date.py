"""
Template filter: render an ISO-8601 timestamp as a human-readable
relative date (e.g. "yesterday", "2 days ago", "3 months ago").
"""

from datetime import datetime

from django import template
from django.utils import timezone
from django.utils.timesince import timesince

register = template.Library()


@register.filter
def relative_date(value):
    if not value:
        return ""

    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    elif isinstance(value, datetime):
        dt = value
    else:
        return value

    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())

    delta = timezone.now() - dt
    if delta.days < 1:
        return "today"
    if delta.days == 1:
        return "yesterday"
    return f"{timesince(dt, depth=1)} ago"