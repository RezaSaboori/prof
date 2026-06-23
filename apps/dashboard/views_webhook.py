# apps/dashboard/views_webhook.py

from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from django.conf import settings


from apps.core.webhook_client import WebhookClient, WebhookConfig

# ── Gateway config ─────────────────────────────────────────────────────────────
# Move these to settings.py / .env for production
_GATEWAY_CONFIG = WebhookConfig(
    url=settings.N8N_GATEWAY_URL,
    secret_header_name=settings.N8N_GATEWAY_SECRET_HEADER_NAME,
    secret_header_value=settings.N8N_GATEWAY_SECRET_HEADER_VALUE,
    timeout=30,
    max_retries=5,
    retry_backoff_base=1.5,
)

_GATEWAY_CLIENT = WebhookClient(_GATEWAY_CONFIG)

# ── Payload ────────────────────────────────────────────────────────────────────
_TEST_PAYLOAD = [
    {
        "id": "123",
        "route": "resume",
        "input": "a dude",
    }
]


# ── View ───────────────────────────────────────────────────────────────────────

@login_required
@require_POST
def trigger_webhook(request):
    result = _GATEWAY_CLIENT.send(_TEST_PAYLOAD)

    body = {
        "success": result.success,
        "attempts": result.attempts,
        "duration_ms": result.duration_ms,
        "status_code": result.status_code,
    }

    if result.success:
        body["response"] = result.data
        return JsonResponse(body, status=200)
    else:
        body["error"] = result.error
        return JsonResponse(body, status=502)