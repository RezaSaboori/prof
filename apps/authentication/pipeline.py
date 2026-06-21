# apps/authentication/pipeline.py
import logging
import requests

logger = logging.getLogger(__name__)


def sync_supabase_user(backend, user, response, *args, **kwargs):
    """
    Custom social-auth pipeline step.
    Upserts the authenticated user into Supabase public.user_info.
    """
    from django.conf import settings

    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_ROLE_KEY  # service-role key — server-side only

    if not url or not key:
        logger.warning('Supabase credentials missing — skipping sync.')
        return

    email = user.email or response.get('email', '')
    name  = (
        response.get('name')
        or f"{response.get('given_name','')} {response.get('family_name','')}".strip()
        or user.get_full_name()
        or user.username
    )

    if not email:
        logger.warning('No email from OAuth response — skipping Supabase sync.')
        return

    headers = {
        'apikey':        key,
        'Authorization': f'Bearer {key}',
        'Content-Type':  'application/json',
        # ON CONFLICT (email) DO UPDATE — merges without creating duplicates
        'Prefer':        'resolution=merge-duplicates,return=minimal',
    }
    payload = {
        'name':            name,
        'email':           email,
        'summary':         False,
        'original_resume': '',
    }

    try:
        r = requests.post(
            f'{url}/rest/v1/user_info',
            json=payload,
            headers=headers,
            timeout=10,
        )
        r.raise_for_status()
        logger.info(f'Supabase user_info upserted: {email}')
    except requests.RequestException as e:
        logger.error(f'Supabase sync failed for {email}: {e}')
