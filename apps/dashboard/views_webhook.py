# apps/dashboard/views_webhook.py

import json

from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from django.conf import settings

from apps.core.webhook_client import WebhookClient, WebhookConfig

# ── Gateway config ─────────────────────────────────────────────────────────────
_GATEWAY_CONFIG = WebhookConfig(
    url=settings.N8N_GATEWAY_URL,
    secret_header_name=settings.N8N_GATEWAY_SECRET_HEADER_NAME,
    secret_header_value=settings.N8N_GATEWAY_SECRET_HEADER_VALUE,
    timeout=30,
    max_retries=5,
    retry_backoff_base=1.5,
)

_GATEWAY_CLIENT = WebhookClient(_GATEWAY_CONFIG)

# ── Gateway config — Mode 1: Mentor ─────────────────────────────────────────────
_GATEWAY_CONFIG_MODE1 = WebhookConfig(
    url=settings.N8N_GATEWAY_URL_MODE1,
    secret_header_name=settings.N8N_GATEWAY_SECRET_HEADER_NAME_MODE1,
    secret_header_value=settings.N8N_GATEWAY_SECRET_HEADER_VALUE_MODE1,
    timeout=30,
    max_retries=5,
    retry_backoff_base=1.5,
)

_GATEWAY_CLIENT_MODE1 = WebhookClient(_GATEWAY_CONFIG_MODE1)

# ── Gateway config — Mode 2: Keywords ───────────────────────────────────────────
_GATEWAY_CONFIG_MODE2 = WebhookConfig(
    url=settings.N8N_GATEWAY_URL_MODE2,
    secret_header_name=settings.N8N_GATEWAY_SECRET_HEADER_NAME_MODE2,
    secret_header_value=settings.N8N_GATEWAY_SECRET_HEADER_VALUE_MODE2,
    timeout=30,
    max_retries=5,
    retry_backoff_base=1.5,
)

_GATEWAY_CLIENT_MODE2 = WebhookClient(_GATEWAY_CONFIG_MODE2)

# ── Gateway config — Mode 3: Link or JD ─────────────────────────────────────────
_GATEWAY_CONFIG_MODE3 = WebhookConfig(
    url=settings.N8N_GATEWAY_URL_MODE3,
    secret_header_name=settings.N8N_GATEWAY_SECRET_HEADER_NAME_MODE3,
    secret_header_value=settings.N8N_GATEWAY_SECRET_HEADER_VALUE_MODE3,
    timeout=30,
    max_retries=5,
    retry_backoff_base=1.5,
)

_GATEWAY_CLIENT_MODE3 = WebhookClient(_GATEWAY_CONFIG_MODE3)

# ── Test payload (dashboard home webhook test btn) ─────────────────────────────
def _build_test_payload(request):
    """Build the n8n payload from the values entered beside the test button."""
    try:
        data = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        data = {}
    return [
        {
            "id": str(data.get("id", "")).strip(),
            "route": str(data.get("route", "")).strip(),
            "input": str(data.get("input", "")).strip(),
        }
    ]


def _send_webhook(payload, client=None):
    """Shared helper — returns (success: bool, body: dict, http_status: int)."""
    result = (client or _GATEWAY_CLIENT).send(payload)
    body = {
        "success": result.success,
        "attempts": result.attempts,
        "duration_ms": result.duration_ms,
        "status_code": result.status_code,
    }
    if result.success:
        body["response"] = result.data
        return True, body, 200
    else:
        body["error"] = result.error
        return False, body, 502


# ── Views ──────────────────────────────────────────────────────────────────────

@login_required
@require_POST
def trigger_webhook(request):
    """Dashboard home — webhook test button."""
    _, body, status = _send_webhook(_build_test_payload(request))
    return JsonResponse(body, status=status)


@login_required
@require_POST
def trigger_webhook_mode1(request):
    """Dashboard home — webhook test button (Mode 1: Mentor)."""
    _, body, status = _send_webhook(_build_test_payload(request), _GATEWAY_CLIENT_MODE1)
    return JsonResponse(body, status=status)


@login_required
@require_POST
def trigger_webhook_mode2(request):
    """Dashboard home — webhook test button (Mode 2: Keywords)."""
    _, body, status = _send_webhook(_build_test_payload(request), _GATEWAY_CLIENT_MODE2)
    return JsonResponse(body, status=status)


@login_required
@require_POST
def trigger_webhook_mode3(request):
    """Dashboard home — webhook test button (Mode 3: Link or JD)."""
    _, body, status = _send_webhook(_build_test_payload(request), _GATEWAY_CLIENT_MODE3)
    return JsonResponse(body, status=status)


@login_required
@require_POST
def webhook_resume_uploaded(request):
    """
    Called by upload.js after the Send button successfully sets
    original_resume_status = 1. Fires the Resume_Uploaded event.
    """
    payload = [{"id": "123", "route": "resume", "input": "Resume_Uploaded"}]
    _, body, status = _send_webhook(payload)
    return JsonResponse(body, status=status)


@login_required
@require_POST
def webhook_information_confirmed(request):
    """
    Called by dashboard-info.js after the Confirm/Save Changes button
    successfully saves the form (and advances status to 4 when in Confirm mode).
    Fires the Information_Confirmed event.
    """
    payload = [{"id": "123", "route": "resume", "input": "Information_Confirmed"}]
    _, body, status = _send_webhook(payload)
    return JsonResponse(body, status=status)