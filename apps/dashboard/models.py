from django.db import models
from django.utils import timezone


class CompanyLogo(models.Model):
    """
    Persistent, frequency-aware store for resolved company logos.

    Layer 2 of the logo cache (Layer 1 = Django cache). Survives process
    restarts and is shared between gunicorn workers.

    The frequency fields (hit_count / last_requested_at) drive the smart
    retention policy enforced by the `cleanup_company_logos` command:
    frequently used logos are kept, old rarely-used rows are evicted.
    """

    class Kind(models.TextChoices):
        DOMAIN = 'domain', 'Domain'
        NAME = 'name', 'Company name'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        RESOLVED = 'resolved', 'Resolved'

    lookup_key = models.CharField(max_length=255, unique=True, db_index=True)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.DOMAIN)
    logo_url = models.TextField(blank=True, default='')
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    hit_count = models.PositiveIntegerField(default=0)
    first_requested_at = models.DateTimeField(default=timezone.now)
    last_requested_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-hit_count']

    def __str__(self):
        return f'{self.lookup_key} ({self.status})'