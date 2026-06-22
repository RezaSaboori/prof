import requests
import logging
import json
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.conf import settings

logger = logging.getLogger(__name__)

# ── Module-level Session with retry + connection pooling ──────────────────────
# One session is reused across all requests (keep-alive, connection pool).
# Retry only on transient errors: connection resets, timeouts, 502/503/504.
# backoff_factor=0.5 means: 0.5s, 1s, 2s between attempts (exponential).
_retry_strategy = Retry(
    total=3,
    connect=3,
    read=3,
    backoff_factor=0.5,
    status_forcelist=[502, 503, 504],
    allowed_methods=["GET", "POST", "HEAD"],
    raise_on_status=False,
)
_http_adapter = HTTPAdapter(
    max_retries=_retry_strategy,
    pool_connections=10,
    pool_maxsize=20,
)
_session = requests.Session()
_session.mount("https://", _http_adapter)
_session.mount("http://",  _http_adapter)


def _supabase_headers():
    return {
        'apikey':        settings.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': f'Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}',
        'Content-Type':  'application/json',
    }


@login_required
def index(request):
    user = request.user
    display_name = user.first_name or user.username
    return render(request, 'dashboard/index.html', {
        'display_name': display_name,
        'active_tab': 'home',
    })


@login_required
def infos(request):
    return render(request, 'dashboard/infos.html', {
        'display_name': request.user.first_name or request.user.username,
        'active_tab': 'infos',
    })


@login_required
@require_http_methods(['GET'])
def api_user_info_get(request):
    """Proxy GET — fetch user_info row for the logged-in user."""
    email = request.user.email
    try:
        resp = _session.get(
            f'{settings.SUPABASE_URL}/rest/v1/user_info',
            params={'email': f'eq.{email}', 'limit': 1},
            headers=_supabase_headers(),
            timeout=(5, 15),  # (connect timeout, read timeout)
        )
        if not resp.ok:
            logger.error(f'Supabase GET error {resp.status_code}: {resp.text}')
            return JsonResponse(
                {'error': f'Supabase {resp.status_code}', 'detail': resp.text},
                status=502,
            )
        rows = resp.json()
        if not rows:
            return JsonResponse({}, safe=False)

        row = rows[0]

        # Parse JSON-string columns into real Python objects
        JSON_COLUMNS = [
            'education', 'certifications', 'experiences', 'skills',
            'blocked_industries', 'work_style', 'blocked_companies',
            'blocked_titles', 'blocked_details',
        ]
        for col in JSON_COLUMNS:
            val = row.get(col)
            if isinstance(val, str):
                try:
                    row[col] = json.loads(val)
                except (json.JSONDecodeError, ValueError):
                    row[col] = []

        # Rename 'experiences' → 'experience' to match what the JS expects
        row['experience'] = row.pop('experiences', [])

        return JsonResponse(row, safe=False)

    except requests.exceptions.Timeout:
        logger.error('Supabase GET timed out for %s', email)
        return JsonResponse({'error': 'timeout'}, status=504)
    except requests.exceptions.ConnectionError as e:
        logger.error('Supabase GET connection error for %s: %s', email, e)
        return JsonResponse({'error': 'connection_error'}, status=502)
    except requests.RequestException as e:
        logger.error('user_info GET failed: %s', e)
        return JsonResponse({'error': str(e)}, status=502)


@login_required
@require_http_methods(['POST'])
def api_user_info_save(request):
    """Proxy POST — upsert user_info row for the logged-in user."""
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    email = request.user.email

    def to_json_str(val):
        if val is None:
            return None
        if isinstance(val, str):
            return val
        return json.dumps(val)

    payload = {
        'email':              email,
        'name':               body.get('name', ''),
        'phone':              body.get('phone') or None,
        'linkedin':           body.get('linkedin') or None,
        'website':            body.get('website') or None,
        'location':           body.get('location') or None,
        'education':          to_json_str(body.get('education')),
        'certifications':     to_json_str(body.get('certifications')),
        'experiences':        to_json_str(body.get('experience')),
        'skills':             to_json_str(body.get('skills')),
        'blocked_industries': to_json_str(body.get('blocked_industries')),
        'work_style':         to_json_str(body.get('work_style')),
        'blocked_companies':  to_json_str(body.get('blocked_companies')),
        'blocked_titles':     to_json_str(body.get('blocked_titles')),
        'blocked_details':    to_json_str(body.get('blocked_details')),
        'summary':            False,
        'original_resume':    '',
    }

    try:
        resp = _session.post(
            f'{settings.SUPABASE_URL}/rest/v1/user_info',
            json=payload,
            headers={
                **_supabase_headers(),
                'Prefer': 'resolution=merge-duplicates,return=minimal',
            },
            timeout=(5, 15),
        )
        if not resp.ok:
            logger.error(f'Supabase POST error {resp.status_code}: {resp.text}')
            return JsonResponse(
                {'error': f'Supabase {resp.status_code}', 'detail': resp.text},
                status=502,
            )
        return JsonResponse({'ok': True})

    except requests.exceptions.Timeout:
        logger.error('Supabase POST timed out for %s', email)
        return JsonResponse({'error': 'timeout'}, status=504)
    except requests.exceptions.ConnectionError as e:
        logger.error('Supabase POST connection error for %s: %s', email, e)
        return JsonResponse({'error': 'connection_error'}, status=502)
    except requests.RequestException as e:
        logger.error('user_info POST failed: %s', e)
        return JsonResponse({'error': str(e)}, status=502)


@login_required
def jobs(request):
    return render(request, 'dashboard/placeholder.html', {
        'display_name': request.user.first_name or request.user.username,
        'active_tab': 'jobs',
        'page_title': "Job's",
    })