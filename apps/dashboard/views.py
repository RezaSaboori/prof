import requests
import logging
import json
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.conf import settings

logger = logging.getLogger(__name__)


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
        resp = requests.get(
            f'{settings.SUPABASE_URL}/rest/v1/user_info',
            params={'email': f'eq.{email}', 'limit': 1},
            headers=_supabase_headers(),
            timeout=10,
        )
        # Surface the real Supabase error body instead of hiding it
        if not resp.ok:
            logger.error(f'Supabase GET error {resp.status_code}: {resp.text}')
            return JsonResponse(
                {'error': f'Supabase {resp.status_code}', 'detail': resp.text},
                status=502,
            )
        rows = resp.json()
        return JsonResponse(rows[0] if rows else {}, safe=False)
    except requests.RequestException as e:
        logger.error(f'user_info GET failed: {e}')
        return JsonResponse({'error': str(e)}, status=502)


@login_required
@require_http_methods(['POST'])
def api_user_info_save(request):
    """Proxy POST — upsert user_info row for the logged-in user.
    Expects flat fields matching the user_info table schema.
    """
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    # Enforce email from session — never trust client
    email = request.user.email

    # Map to the real flat table columns.
    # education / certifications / experiences / skills are stored as JSON strings.
    # blocked fields are separate text columns.
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
        # required NOT NULL columns — preserve existing values via merge
        'summary':            False,
        'original_resume':    '',
    }

    try:
        resp = requests.post(
            f'{settings.SUPABASE_URL}/rest/v1/user_info',
            json=payload,
            headers={
                **_supabase_headers(),
                'Prefer': 'resolution=merge-duplicates,return=minimal',
            },
            timeout=10,
        )
        if not resp.ok:
            logger.error(f'Supabase POST error {resp.status_code}: {resp.text}')
            return JsonResponse(
                {'error': f'Supabase {resp.status_code}', 'detail': resp.text},
                status=502,
            )
        return JsonResponse({'ok': True})
    except requests.RequestException as e:
        logger.error(f'user_info POST failed: {e}')
        return JsonResponse({'error': str(e)}, status=502)


@login_required
def jobs(request):
    return render(request, 'dashboard/placeholder.html', {
        'display_name': request.user.first_name or request.user.username,
        'active_tab': 'jobs',
        'page_title': "Job's",
    })