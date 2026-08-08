# Generated migration for the CompanyLogo model.

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='CompanyLogo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('lookup_key', models.CharField(db_index=True, max_length=255, unique=True)),
                ('kind', models.CharField(choices=[('domain', 'Domain'), ('name', 'Company name')], default='domain', max_length=10)),
                ('logo_url', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('resolved', 'Resolved')], default='pending', max_length=10)),
                ('hit_count', models.PositiveIntegerField(default=0)),
                ('first_requested_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('last_requested_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'ordering': ['-hit_count'],
            },
        ),
    ]