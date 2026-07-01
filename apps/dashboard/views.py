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
import os
from django.views.decorators.http import require_POST
from django.conf import settings
import tempfile
import pymupdf4llm

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
@require_http_methods(['GET'])
def api_user_info_personal_get(request):
    """
    PHASE-1 FAST ENDPOINT — returns only scalar (non-JSON) columns.

    Architecture note — Two-phase profile load:
    ┌─────────────────────────────────────────────────────────────────┐
    │  The full user_info row is ~58 KB of serialised JSON arrays.    │
    │  Fetching it in one call causes 15-45 s timeouts on cold        │
    │  Supabase connections (free/small tier wakes the instance).     │
    │                                                                 │
    │  Solution: split into two sequential API calls:                 │
    │   • /api/user-info/personal/  → scalar columns only (~200 B)    │
    │     → populated immediately; user sees live data in < 1 s       │
    │   • /api/user-info/           → full row with JSON arrays       │
    │     → called right after Phase 1 resolves; fills in the rest    │
    │                                                                 │
    │  PostgREST column-select: ?select=col1,col2 avoids transferring │
    │  large jsonb columns over the wire at all, not just in Django.  │
    └─────────────────────────────────────────────────────────────────┘

    To extend: if you add a new scalar column to the user_info table,
    add its name to the SELECT_COLS tuple below.
    If you add a new JSON/array column, it belongs in api_user_info_get.
    """
    # Only these lightweight scalar columns are fetched.
    # PostgREST's ?select= param tells Supabase to project on the DB side —
    # the large jsonb columns are never read from disk or sent over the wire.
    SELECT_COLS = ('name', 'phone', 'linkedin', 'website', 'location', 'email')

    email = request.user.email
    try:
        resp = _session.get(
            f'{settings.SUPABASE_URL}/rest/v1/user_info',
            params={
                'email':  f'eq.{email}',
                'select': ','.join(SELECT_COLS),
                'limit':  1,
            },
            headers=_supabase_headers(),
            timeout=(5, 8),   # tighter timeout — this call must be fast
        )
        if not resp.ok:
            logger.error('Supabase personal GET error %s: %s', resp.status_code, resp.text)
            return JsonResponse(
                {'error': f'Supabase {resp.status_code}', 'detail': resp.text},
                status=502,
            )
        rows = resp.json()
        return JsonResponse(rows[0] if rows else {}, safe=False)

    except requests.exceptions.Timeout:
        logger.error('Supabase personal GET timed out for %s', email)
        return JsonResponse({'error': 'timeout'}, status=504)
    except requests.exceptions.ConnectionError as e:
        logger.error('Supabase personal GET connection error for %s: %s', email, e)
        return JsonResponse({'error': 'connection_error'}, status=502)
    except requests.RequestException as e:
        logger.error('user_info personal GET failed: %s', e)
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



@login_required
@require_POST
def api_upload_resume(request):
    """
    Receives a PDF resume via XHR (FormData key: 'resume').
    Converts it to Markdown using pymupdf4llm, saves the result to
    Supabase user_info.original_resume, and sets original_resume_status = 1.
    Returns JSON { "status": "ok" } or { "error": "..." }.
    """


    resume = request.FILES.get('resume')
    if not resume:
        return JsonResponse({'error': 'No file provided.'}, status=400)

    allowed_ext = {'.pdf'}
    ext = os.path.splitext(resume.name)[1].lower()
    if ext not in allowed_ext:
        return JsonResponse({'error': 'Only PDF files are supported.'}, status=415)

    MAX_SIZE = 10 * 1024 * 1024  # 10 MB
    if resume.size > MAX_SIZE:
        return JsonResponse({'error': 'File exceeds 10 MB limit.'}, status=413)

    email = request.user.email

    try:
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
            for chunk in resume.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        try:
            md = pymupdf4llm.to_markdown(tmp_path)
        finally:
            os.remove(tmp_path)

    except Exception as exc:
        logger.error('pymupdf4llm conversion failed for %s: %s', email, exc)
        return JsonResponse({'error': 'Failed to convert PDF to markdown.'}, status=500)

    # Upsert original_resume and set original_resume_status = 1
    try:
        # Check if row exists
        get_resp = _session.get(
            f'{settings.SUPABASE_URL}/rest/v1/user_info',
            params={'email': f'eq.{email}', 'limit': 1},
            headers=_supabase_headers(),
            timeout=(5, 15),
        )
        if not get_resp.ok:
            logger.error('Supabase GET error %s (resume upload): %s', get_resp.status_code, get_resp.text)
            return JsonResponse({'error': f'Supabase {get_resp.status_code}'}, status=502)

        row_exists = bool(get_resp.json())
        resume_payload = {
            'original_resume': md,
        }

        if row_exists:
            resp = _session.patch(
                f'{settings.SUPABASE_URL}/rest/v1/user_info',
                params={'email': f'eq.{email}'},
                json=resume_payload,
                headers={**_supabase_headers(), 'Prefer': 'return=minimal'},
                timeout=(5, 30),
            )
        else:
            resume_payload['email'] = email
            resp = _session.post(
                f'{settings.SUPABASE_URL}/rest/v1/user_info',
                json=resume_payload,
                headers={**_supabase_headers(), 'Prefer': 'return=minimal'},
                timeout=(5, 30),
            )

        if not resp.ok:
            logger.error('Supabase resume save error %s for %s: %s', resp.status_code, email, resp.text)
            return JsonResponse({'error': f'Supabase {resp.status_code}', 'detail': resp.text}, status=502)

        return JsonResponse({'status': 'ok'})

    except requests.exceptions.Timeout:
        logger.error('Supabase timed out saving resume for %s', email)
        return JsonResponse({'error': 'timeout'}, status=504)
    except requests.exceptions.ConnectionError as exc:
        logger.error('Supabase connection error saving resume for %s: %s', email, exc)
        return JsonResponse({'error': 'connection_error'}, status=502)
    except requests.RequestException as exc:
        logger.error('resume upload failed for %s: %s', email, exc)
        return JsonResponse({'error': str(exc)}, status=502)
    
@login_required
@require_http_methods(['GET'])
def api_resume_status(request):
    """
    Returns only the original_resume_status scalar for the logged-in user.
    Used by upload.js to poll and update the upload-hero glass state.
    """
    email = request.user.email
    try:
        resp = _session.get(
            f'{settings.SUPABASE_URL}/rest/v1/user_info',
            params={
                'email':  f'eq.{email}',
                'select': 'original_resume_status',
                'limit':  1,
            },
            headers=_supabase_headers(),
            timeout=(5, 8),
        )
        if not resp.ok:
            logger.error('Supabase resume_status GET error %s: %s', resp.status_code, resp.text)
            return JsonResponse({'error': f'Supabase {resp.status_code}'}, status=502)

        rows = resp.json()
        if not rows:
            return JsonResponse({'original_resume_status': 0})

        return JsonResponse({'original_resume_status': rows[0].get('original_resume_status', 0)})

    except requests.exceptions.Timeout:
        logger.error('Supabase resume_status GET timed out for %s', email)
        return JsonResponse({'error': 'timeout'}, status=504)
    except requests.exceptions.ConnectionError as e:
        logger.error('Supabase resume_status GET connection error for %s: %s', email, e)
        return JsonResponse({'error': 'connection_error'}, status=502)
    except requests.RequestException as e:
        logger.error('resume_status GET failed for %s: %s', email, e)
        return JsonResponse({'error': str(e)}, status=502)
    
@login_required
@require_POST
def api_set_resume_status(request):
    """
    Accepts { "original_resume_status": <int> } and writes it to Supabase.
    Called by the Send button in upload.js to manually advance the status to 1.
    """
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    new_status = body.get('original_resume_status')
    if not isinstance(new_status, int):
        return JsonResponse({'error': 'original_resume_status must be an integer'}, status=400)

    email = request.user.email
    try:
        get_resp = _session.get(
            f'{settings.SUPABASE_URL}/rest/v1/user_info',
            params={'email': f'eq.{email}', 'limit': 1},
            headers=_supabase_headers(),
            timeout=(5, 10),
        )
        if not get_resp.ok:
            return JsonResponse({'error': f'Supabase {get_resp.status_code}'}, status=502)

        row_exists = bool(get_resp.json())
        payload = {'original_resume_status': new_status}

        if row_exists:
            resp = _session.patch(
                f'{settings.SUPABASE_URL}/rest/v1/user_info',
                params={'email': f'eq.{email}'},
                json=payload,
                headers={**_supabase_headers(), 'Prefer': 'return=minimal'},
                timeout=(5, 15),
            )
        else:
            payload['email'] = email
            resp = _session.post(
                f'{settings.SUPABASE_URL}/rest/v1/user_info',
                json=payload,
                headers={**_supabase_headers(), 'Prefer': 'return=minimal'},
                timeout=(5, 15),
            )

        if not resp.ok:
            logger.error('Supabase set_resume_status error %s for %s: %s', resp.status_code, email, resp.text)
            return JsonResponse({'error': f'Supabase {resp.status_code}'}, status=502)

        return JsonResponse({'ok': True})

    except requests.exceptions.Timeout:
        logger.error('Supabase set_resume_status timed out for %s', email)
        return JsonResponse({'error': 'timeout'}, status=504)
    except requests.exceptions.ConnectionError as exc:
        logger.error('Supabase set_resume_status connection error for %s: %s', email, exc)
        return JsonResponse({'error': 'connection_error'}, status=502)
    except requests.RequestException as exc:
        logger.error('set_resume_status failed for %s: %s', email, exc)
        return JsonResponse({'error': str(exc)}, status=502)

@login_required
@require_http_methods(['GET'])
def api_balance_get(request):
    """Fetch only the Balance column for the logged-in user."""
    email = request.user.email
    try:
        resp = _session.get(
            f'{settings.SUPABASE_URL}/rest/v1/user_info',
            params={
                'email':  f'eq.{email}',
                'select': 'Balance',
                'limit':  1,
            },
            headers=_supabase_headers(),
            timeout=(5, 8),
        )
        if not resp.ok:
            logger.error('Supabase balance GET error %s: %s', resp.status_code, resp.text)
            return JsonResponse({'error': f'Supabase {resp.status_code}'}, status=502)
        rows = resp.json()
        return JsonResponse({'balance': rows[0].get('Balance', 0) if rows else 0})
    except requests.exceptions.Timeout:
        logger.error('Supabase balance GET timed out for %s', email)
        return JsonResponse({'error': 'timeout'}, status=504)
    except requests.exceptions.ConnectionError as e:
        logger.error('Supabase balance GET connection error for %s: %s', email, e)
        return JsonResponse({'error': 'connection_error'}, status=502)
    except requests.RequestException as e:
        logger.error('balance GET failed for %s: %s', email, e)
        return JsonResponse({'error': str(e)}, status=502)