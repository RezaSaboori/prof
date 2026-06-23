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
    """
    Upsert user_info row for the logged-in user.

    Strategy:
      1. GET the existing row by email.
      2. If row exists  → PATCH (partial update) using the row's primary key.
      3. If no row      → POST (insert) the full payload.

    JSON columns (education, skills, etc.) are stored as JSON strings in
    Supabase. Incoming values from the client may be plain Python objects
    (lists/dicts) or already-stringified JSON – both are handled.
    Null/missing fields in the incoming body are NOT overwritten onto
    existing data; only explicitly provided keys are written.
    """
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    email = request.user.email

    JSON_COLUMNS_MAP = {
        # body key        : supabase column
        'education':          'education',
        'certifications':     'certifications',
        'experience':         'experiences',   # JS sends 'experience', DB stores 'experiences'
        'skills':             'skills',
        'blocked_industries': 'blocked_industries',
        'work_style':         'work_style',
        'blocked_companies':  'blocked_companies',
        'blocked_titles':     'blocked_titles',
        'blocked_details':    'blocked_details',
    }

    SCALAR_COLUMNS_MAP = {
        'name':     'name',
        'phone':    'phone',
        'linkedin': 'linkedin',
        'website':  'website',
        'location': 'location',
    }

    def serialize_json_field(val):
        """Ensure JSON-serialisable value becomes a JSON string for Supabase."""
        if val is None:
            return None
        if isinstance(val, str):
            # Already a string – validate it is valid JSON, then return as-is
            try:
                json.loads(val)
                return val
            except (json.JSONDecodeError, ValueError):
                return json.dumps([])
        return json.dumps(val, ensure_ascii=False)

    # ── Step 1: check whether a row already exists ───────────────────────────
    try:
        get_resp = _session.get(
            f'{settings.SUPABASE_URL}/rest/v1/user_info',
            params={'email': f'eq.{email}', 'limit': 1},
            headers=_supabase_headers(),
            timeout=(5, 15),
        )
    except requests.exceptions.Timeout:
        logger.error('Supabase GET timed out for %s (in save)', email)
        return JsonResponse({'error': 'timeout'}, status=504)
    except requests.exceptions.ConnectionError as exc:
        logger.error('Supabase GET connection error for %s (in save): %s', email, exc)
        return JsonResponse({'error': 'connection_error'}, status=502)

    if not get_resp.ok:
        logger.error('Supabase GET error %s (in save): %s', get_resp.status_code, get_resp.text)
        return JsonResponse(
            {'error': f'Supabase {get_resp.status_code}', 'detail': get_resp.text},
            status=502,
        )

    existing_rows = get_resp.json()
    row_exists = bool(existing_rows)

    # ── Step 2: build the payload ─────────────────────────────────────────────
    payload = {}

    # Scalar fields – only include keys that were sent in the request body
    for body_key, db_col in SCALAR_COLUMNS_MAP.items():
        if body_key in body:
            payload[db_col] = body[body_key] or None

    # JSON fields – only include keys that were sent in the request body
    for body_key, db_col in JSON_COLUMNS_MAP.items():
        if body_key in body:
            payload[db_col] = serialize_json_field(body[body_key])

    if not payload:
        return JsonResponse({'ok': True, 'message': 'nothing to update'})

    # ── Step 3: INSERT or PATCH ───────────────────────────────────────────────
    try:
        if row_exists:
            # PATCH: update only the columns present in payload
            resp = _session.patch(
                f'{settings.SUPABASE_URL}/rest/v1/user_info',
                params={'email': f'eq.{email}'},
                json=payload,
                headers={
                    **_supabase_headers(),
                    'Prefer': 'return=minimal',
                },
                timeout=(5, 15),
            )
        else:
            # INSERT: new row – must include email + provide safe defaults
            # for mandatory JSON columns so they aren't null
            full_payload = {'email': email}

            # defaults for JSON columns (empty list)
            for db_col in JSON_COLUMNS_MAP.values():
                full_payload[db_col] = serialize_json_field([])

            # defaults for scalar columns
            for db_col in SCALAR_COLUMNS_MAP.values():
                full_payload[db_col] = None

            # Add extra fields that live in the table but aren't user-editable
            full_payload['summary'] = False
            full_payload['original_resume'] = ''

            # Override with whatever was actually submitted
            full_payload.update(payload)

            resp = _session.post(
                f'{settings.SUPABASE_URL}/rest/v1/user_info',
                json=full_payload,
                headers={
                    **_supabase_headers(),
                    'Prefer': 'return=minimal',
                },
                timeout=(5, 15),
            )

        if not resp.ok:
            logger.error(
                'Supabase %s error %s for %s: %s',
                'PATCH' if row_exists else 'POST',
                resp.status_code,
                email,
                resp.text,
            )
            return JsonResponse(
                {'error': f'Supabase {resp.status_code}', 'detail': resp.text},
                status=502,
            )

        return JsonResponse({'ok': True})

    except requests.exceptions.Timeout:
        logger.error('Supabase %s timed out for %s', 'PATCH' if row_exists else 'POST', email)
        return JsonResponse({'error': 'timeout'}, status=504)
    except requests.exceptions.ConnectionError as exc:
        logger.error('Supabase %s connection error for %s: %s', 'PATCH' if row_exists else 'POST', email, exc)
        return JsonResponse({'error': 'connection_error'}, status=502)
    except requests.RequestException as exc:
        logger.error('user_info save failed for %s: %s', email, exc)
        return JsonResponse({'error': str(exc)}, status=502)


@login_required
def jobs(request):
    return render(request, 'dashboard/placeholder.html', {
        'display_name': request.user.first_name or request.user.username,
        'active_tab': 'jobs',
        'page_title': "Job's",
    })