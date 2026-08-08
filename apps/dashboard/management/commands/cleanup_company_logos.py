"""
Smart eviction for the CompanyLogo store.

Deletes rows that are BOTH old and rarely used, so the hot set (frequent
companies) stays small and fast while very old one-off logos disappear.
Run on a schedule (cron / Render Cron Job), e.g. daily:

    python manage.py cleanup_company_logos
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.dashboard.models import CompanyLogo

STALE_DAYS = 60        # rows not requested within this window are stale
MIN_HITS_TO_KEEP = 5   # ...unless they are frequently used


class Command(BaseCommand):
    help = 'Evict old, rarely-used company logo rows; keep frequent ones.'

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=STALE_DAYS)
        stale = CompanyLogo.objects.filter(
            last_requested_at__lt=cutoff,
            hit_count__lt=MIN_HITS_TO_KEEP,
        )
        deleted, _ = stale.delete()
        self.stdout.write(self.style.SUCCESS(
            f'Evicted {deleted} stale company logo row(s).'
        ))