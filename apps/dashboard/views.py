import requests
import logging
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.conf import settings
import json

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
        resp.raise_for_status()
        rows = resp.json()
        return JsonResponse(rows[0] if rows else {}, safe=False)
    except Exception as e:
        logger.error(f'user_info GET failed: {e}')
        return JsonResponse({'error': str(e)}, status=502)


@login_required
@require_http_methods(['POST'])
def api_user_info_save(request):
    """Proxy POST — upsert user_info row for the logged-in user."""
    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    # Always enforce the email from the authenticated session — never trust client
    payload['email'] = request.user.email

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
        resp.raise_for_status()
        return JsonResponse({'ok': True})
    except Exception as e:
        logger.error(f'user_info POST failed: {e}')
        return JsonResponse({'error': str(e)}, status=502)


@login_required
def jobs(request):
    return render(request, 'dashboard/placeholder.html', {
        'display_name': request.user.first_name or request.user.username,
        'active_tab': 'jobs',
        'page_title': "Job's",
    })