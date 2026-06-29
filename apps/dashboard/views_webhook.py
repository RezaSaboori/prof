# apps/dashboard/views_webhook.py

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

# ── Test payload (dashboard home webhook test btn) ─────────────────────────────
_TEST_PAYLOAD = [
    {
        "id": "123",
        "route": "resume",
        "input": "a dude",
    }
]


def _send_webhook(payload):
    """Shared helper — returns (success: bool, body: dict, http_status: int)."""
    result = _GATEWAY_CLIENT.send(payload)
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
    _, body, status = _send_webhook(_TEST_PAYLOAD)
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