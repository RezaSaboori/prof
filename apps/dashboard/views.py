import requests
import logging
import json
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import ensure_csrf_cookie
from django.contrib.auth.decorators import login_required
from django.conf import settings
import os
from django.views.decorators.http import require_POST
from django.conf import settings
import tempfile
import pymupdf4llm

from apps.dashboard.services import (
    job_document_revision_service,
    job_qualification_service,
    logo_service,
    score_rationale_service,
)

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
@ensure_csrf_cookie
def jobs(request):
    """Fetch user's processed jobs from Supabase."""
    SELECT_COLS = (
        'id', 'created_at', 'link', 'title', 'company', 'location',
        'qualifications', 'score', 'salary', 'cover_letter', 'resume',
        'paid', 'score_rationale',
    )
    user_id = request.user.id
    email = request.user.email
    jobs_data = []
    
    logger.info(f'Jobs view: Django user_id={user_id}, email={email}')
    
    try:
        # First try with Django user ID
        resp = _session.get(
            f'{settings.SUPABASE_URL}/rest/v1/jobs_processed',
            params={
                'user_id': f'eq.{user_id}',
                'select': ','.join(SELECT_COLS),
                'order': 'created_at.desc',
            },
            headers=_supabase_headers(),
            timeout=(10, 20),
        )
        
        if resp.ok:
            jobs_data = resp.json()
            logger.info(f'Found {len(jobs_data)} jobs for user_id={user_id}')
            
            # If no jobs found with Django user ID, try looking up by user_info table
            if not jobs_data:
                logger.info(f'No jobs found with user_id={user_id}, trying email-based lookup')
                
                # Get the user_info row to find the associated user_id in jobs_processed
                info_resp = _session.get(
                    f'{settings.SUPABASE_URL}/rest/v1/user_info',
                    params={'email': f'eq.{email}', 'select': 'id', 'limit': 1},
                    headers=_supabase_headers(),
                    timeout=(5, 10),
                )
                
                if info_resp.ok and info_resp.json():
                    user_info_id = info_resp.json()[0].get('id')
                    logger.info(f'Found user_info id={user_info_id}, retrying jobs query')
                    
                    # Retry with user_info table ID
                    retry_resp = _session.get(
                        f'{settings.SUPABASE_URL}/rest/v1/jobs_processed',
                        params={
                            'user_id': f'eq.{user_info_id}',
                            'select': ','.join(SELECT_COLS),
                            'order': 'created_at.desc',
                        },
                        headers=_supabase_headers(),
                        timeout=(10, 20),
                    )
                    
                    if retry_resp.ok:
                        jobs_data = retry_resp.json()
                        logger.info(f'Found {len(jobs_data)} jobs with user_info id={user_info_id}')
        else:
            logger.error(f'Supabase jobs fetch error {resp.status_code}: {resp.text}')
            
    except requests.exceptions.Timeout:
        logger.error('Supabase jobs GET timed out for user %s', user_id)
    except requests.exceptions.ConnectionError as e:
        logger.error('Supabase jobs GET connection error for user %s: %s', user_id, e)
    except requests.RequestException as e:
        logger.error('jobs GET failed for user %s: %s', user_id, e)

    for job in jobs_data:
        job['score_analysis'] = score_rationale_service.extract_analysis(
            job.pop('score_rationale', None)
        )

        qualifications = job_qualification_service.parse_qualifications(
            job.get('qualifications')
        )
        job['qualifications_title'] = qualifications['title']
        job['qualifications_text'] = qualifications['text']
    
    return render(request, 'dashboard/jobs.html', {
        'display_name': request.user.first_name or request.user.username,
        'active_tab': 'jobs',
        'page_title': "Job's",
        'jobs': jobs_data,
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


@login_required
@require_http_methods(['GET'])
def api_company_logo(request):
    """
    Non-blocking logo endpoint for the progressive loader in dashboard-jobs.js.

    Returns one of:
      {"status": "resolved",    "url": "<logo url>"}
      {"status": "pending",     "url": ""}  — resolution queued, poll again
      {"status": "unavailable", "url": ""}  — no logo; keep the letter fallback
    """
    link = request.GET.get('link', '').strip()
    if not link:
        return JsonResponse({'status': 'unavailable', 'url': ''})

    status, logo_url = logo_service.get_logo(link)
    return JsonResponse({'status': status, 'url': logo_url})


@login_required
@require_http_methods(['GET'])
def api_job_document_state(request):
    job_id = request.GET.get('id')
    field = request.GET.get('field')

    if job_id is None or str(job_id).strip() == '':
        return JsonResponse(
            {'error': 'id is required'},
            status=400,
        )

    try:
        state = (
            job_document_revision_service
            .get_document_state(
                _session,
                _supabase_headers(),
                django_user_id=request.user.id,
                email=request.user.email,
                job_id=job_id,
                field=field,
            )
        )

        return JsonResponse({
            'ok': True,
            **state,
        })

    except (
        job_document_revision_service
        .DocumentRevisionError
        
    ) as exc:
        payload = {
            'error': exc.message,
            'code': exc.code,
        }

        if exc.detail:
            payload['detail'] = exc.detail

        return JsonResponse(
            payload,
            status=exc.status,
        )
    except Exception as exc:
        logger.exception(
            'Unexpected document state failure: %s',
            exc,
        )

        return JsonResponse(
            {
                'error':
                    'Document revision failed',
                'code':
                    (
                        job_document_revision_service
                        .REVISION_ERROR_GENERAL
                    ),
            },
            status=500,
        )

@login_required
@require_POST
def api_job_document_revision_create(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse(
            {'error': 'Invalid JSON'},
            status=400,
        )

    job_id = body.get('id')
    field = body.get('field')
    instruction = body.get('instruction')
    current_revision_id = body.get(
        'current_revision_id'
    )
    current_value = body.get('current_value')

    if job_id is None or str(job_id).strip() == '':
        return JsonResponse(
            {'error': 'id is required'},
            status=400,
        )

    try:
        state = (
            job_document_revision_service
            .create_revision_request(
                _session,
                _supabase_headers(),
                django_user_id=request.user.id,
                email=request.user.email,
                job_id=job_id,
                field=field,
                instruction=instruction,
                current_revision_id=current_revision_id,
                current_value=current_value,
            )
        )

        return JsonResponse({
            'ok': True,
            **state,
        })

    except (
        job_document_revision_service
        .DocumentRevisionError
    ) as exc:
        payload = {
            'error': exc.message,
            'code': exc.code,
        }

        if exc.detail:
            payload['detail'] = exc.detail

        return JsonResponse(
            payload,
            status=exc.status,
        )
    except Exception as exc:
        logger.exception(
            'Unexpected document revision failure: %s',
            exc,
        )

        return JsonResponse(
            {
                'error':
                    'Document revision failed',
                'code':
                    (
                        job_document_revision_service
                        .REVISION_ERROR_GENERAL
                    ),
            },
            status=500,
        )


@login_required
@require_POST
def api_job_document_save(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse(
            {'error': 'Invalid JSON'},
            status=400,
        )

    job_id = body.get('id')
    field = body.get('field')
    value = body.get('value')
    current_revision_id = body.get(
        'current_revision_id'
    )

    if job_id is None or str(job_id).strip() == '':
        return JsonResponse(
            {'error': 'id is required'},
            status=400,
        )

    try:
        state = (
            job_document_revision_service
            .save_document(
                _session,
                _supabase_headers(),
                django_user_id=request.user.id,
                email=request.user.email,
                job_id=job_id,
                field=field,
                value=value,
                current_revision_id=current_revision_id,
            )
        )

        return JsonResponse({
            'ok': True,
            **state,
        })

    except (
        job_document_revision_service
        .DocumentRevisionError
    ) as exc:
        payload = {
            'error': exc.message,
            'code': exc.code,
        }

        if exc.detail:
            payload['detail'] = exc.detail

        return JsonResponse(
            payload,
            status=exc.status,
        )
@login_required
@require_POST
def api_job_document_revision_cleanup(
    request,
):
    try:
        body = json.loads(
            request.body
        )
    except json.JSONDecodeError:
        return JsonResponse(
            {
                'error':
                    'Invalid JSON',
            },
            status=400,
        )

    job_id = body.get('id')
    field = body.get('field')

    if (
        job_id is None or
        str(job_id).strip() == ''
    ):
        return JsonResponse(
            {
                'error':
                    'id is required',
            },
            status=400,
        )

    try:
        state = (
            job_document_revision_service
            .discard_processing_revision(
                _session,
                _supabase_headers(),
                django_user_id=
                    request.user.id,
                email=
                    request.user.email,
                job_id=job_id,
                field=field,
            )
        )

        return JsonResponse({
            'ok': True,
            **state,
        })

    except (
        job_document_revision_service
        .DocumentRevisionError
    ) as exc:
        payload = {
            'error': exc.message,
            'code': exc.code,
        }

        if exc.detail:
            payload['detail'] = (
                exc.detail
            )

        return JsonResponse(
            payload,
            status=exc.status,
        )

    except Exception as exc:
        logger.exception(
            (
                'Unexpected document '
                'revision cleanup '
                'failure: %s'
            ),
            exc,
        )

        return JsonResponse(
            {
                'error':
                    'Document revision failed',
                'code':
                    (
                        job_document_revision_service
                        .REVISION_ERROR_GENERAL
                    ),
            },
            status=500,
        )


@login_required
@require_POST
def api_job_document_revision_dismiss(
    request,
):
    try:
        body = json.loads(
            request.body
        )
    except json.JSONDecodeError:
        return JsonResponse(
            {
                'error':
                    'Invalid JSON',
            },
            status=400,
        )

    job_id = body.get('id')
    field = body.get('field')

    if (
        job_id is None or
        str(job_id).strip() == ''
    ):
        return JsonResponse(
            {
                'error':
                    'id is required',
            },
            status=400,
        )

    try:
        state = (
            job_document_revision_service
            .dismiss_unsaved_revision(
                _session,
                _supabase_headers(),
                django_user_id=
                    request.user.id,
                email=
                    request.user.email,
                job_id=job_id,
                field=field,
            )
        )

        return JsonResponse({
            'ok': True,
            **state,
        })

    except (
        job_document_revision_service
        .DocumentRevisionError
    ) as exc:
        payload = {
            'error': exc.message,
            'code': exc.code,
        }

        if exc.detail:
            payload['detail'] = (
                exc.detail
            )

        return JsonResponse(
            payload,
            status=exc.status,
        )


@login_required
@require_POST
def api_job_document_revision_notice_ack(
    request,
):
    try:
        body = json.loads(
            request.body
        )
    except json.JSONDecodeError:
        return JsonResponse(
            {
                'error':
                    'Invalid JSON',
            },
            status=400,
        )

    job_id = body.get('id')
    field = body.get('field')
    revision_id = body.get(
        'revision_id'
    )

    if (
        job_id is None or
        str(job_id).strip() == ''
    ):
        return JsonResponse(
            {
                'error':
                    'id is required',
            },
            status=400,
        )

    if (
        revision_id is None or
        str(revision_id).strip() == ''
    ):
        return JsonResponse(
            {
                'error':
                    'revision_id is required',
            },
            status=400,
        )

    try:
        state = (
            job_document_revision_service
            .acknowledge_revision_notice(
                _session,
                _supabase_headers(),
                django_user_id=
                    request.user.id,
                email=
                    request.user.email,
                job_id=job_id,
                field=field,
                revision_id=
                    revision_id,
            )
        )

        return JsonResponse({
            'ok': True,
            **state,
        })

    except (
        job_document_revision_service
        .DocumentRevisionError
    ) as exc:
        payload = {
            'error': exc.message,
            'code': exc.code,
        }

        if exc.detail:
            payload['detail'] = (
                exc.detail
            )

        return JsonResponse(
            payload,
            status=exc.status,
        )


@login_required
@require_POST
def api_job_unlock(request):
    """
    Unlock a processed job — sets paid = 1 on the user's jobs_processed row.

    Accepts { "id": <jobs_processed primary key> }.
    Mirrors the jobs view lookup: tries the Django user id first, then falls
    back to the user_info row id (the two user_id values used in Supabase).
    """
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    job_id = body.get('id')
    if job_id is None or str(job_id).strip() == '':
        return JsonResponse({'error': 'id is required'}, status=400)

    def patch_paid(uid):
        return _session.patch(
            f'{settings.SUPABASE_URL}/rest/v1/jobs_processed',
            params={'id': f'eq.{job_id}', 'user_id': f'eq.{uid}'},
            json={'paid': 1},
            headers={**_supabase_headers(), 'Prefer': 'return=representation'},
            timeout=(5, 15),
        )

    user_id = request.user.id
    email = request.user.email

    try:
        resp = patch_paid(user_id)
        if not resp.ok:
            logger.error('Supabase unlock error %s for user %s: %s', resp.status_code, user_id, resp.text)
            return JsonResponse({'error': f'Supabase {resp.status_code}', 'detail': resp.text}, status=502)

        if not resp.json():
            # Fallback: jobs may be keyed by the user_info row id (see jobs view)
            info_resp = _session.get(
                f'{settings.SUPABASE_URL}/rest/v1/user_info',
                params={'email': f'eq.{email}', 'select': 'id', 'limit': 1},
                headers=_supabase_headers(),
                timeout=(5, 10),
            )
            if info_resp.ok and info_resp.json():
                user_info_id = info_resp.json()[0].get('id')
                resp = patch_paid(user_info_id)
                if not resp.ok:
                    logger.error('Supabase unlock error %s for user_info %s: %s', resp.status_code, user_info_id, resp.text)
                    return JsonResponse({'error': f'Supabase {resp.status_code}', 'detail': resp.text}, status=502)

            if not resp.json():
                return JsonResponse({'error': 'job not found'}, status=404)

        return JsonResponse({'ok': True})

    except requests.exceptions.Timeout:
        logger.error('Supabase unlock timed out for user %s', user_id)
        return JsonResponse({'error': 'timeout'}, status=504)
    except requests.exceptions.ConnectionError as exc:
        logger.error('Supabase unlock connection error for user %s: %s', user_id, exc)
        return JsonResponse({'error': 'connection_error'}, status=502)
    except requests.RequestException as exc:
        logger.error('job unlock failed for user %s: %s', user_id, exc)
        return JsonResponse({'error': str(exc)}, status=502)


@login_required
@require_POST
def api_job_decline(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    job_id = body.get('id')
    if job_id is None or str(job_id).strip() == '':
        return JsonResponse({'error': 'id is required'}, status=400)

    def patch_declined(uid):
        return _session.patch(
            f'{settings.SUPABASE_URL}/rest/v1/jobs_processed',
            params={
                'id': f'eq.{job_id}',
                'user_id': f'eq.{uid}',
                'paid': 'eq.0',
            },
            json={'paid': 2},
            headers={**_supabase_headers(), 'Prefer': 'return=representation'},
            timeout=(5, 15),
        )

    user_id = request.user.id
    email = request.user.email

    try:
        resp = patch_declined(user_id)

        if not resp.ok:
            logger.error(
                'Supabase decline error %s for user %s: %s',
                resp.status_code,
                user_id,
                resp.text,
            )
            return JsonResponse(
                {
                    'error': f'Supabase {resp.status_code}',
                    'detail': resp.text,
                },
                status=502,
            )

        if not resp.json():
            info_resp = _session.get(
                f'{settings.SUPABASE_URL}/rest/v1/user_info',
                params={
                    'email': f'eq.{email}',
                    'select': 'id',
                    'limit': 1,
                },
                headers=_supabase_headers(),
                timeout=(5, 10),
            )

            if info_resp.ok and info_resp.json():
                user_info_id = info_resp.json()[0].get('id')
                resp = patch_declined(user_info_id)

                if not resp.ok:
                    logger.error(
                        'Supabase decline error %s for user_info %s: %s',
                        resp.status_code,
                        user_info_id,
                        resp.text,
                    )
                    return JsonResponse(
                        {
                            'error': f'Supabase {resp.status_code}',
                            'detail': resp.text,
                        },
                        status=502,
                    )

            if not resp.json():
                return JsonResponse(
                    {'error': 'job not found or no longer locked'},
                    status=404,
                )

        return JsonResponse({'ok': True})

    except requests.exceptions.Timeout:
        logger.error('Supabase decline timed out for user %s', user_id)
        return JsonResponse({'error': 'timeout'}, status=504)
    except requests.exceptions.ConnectionError as exc:
        logger.error(
            'Supabase decline connection error for user %s: %s',
            user_id,
            exc,
        )
        return JsonResponse({'error': 'connection_error'}, status=502)
    except requests.RequestException as exc:
        logger.error('job decline failed for user %s: %s', user_id, exc)
        return JsonResponse({'error': str(exc)}, status=502)