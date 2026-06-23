# apps/dashboard/views_webhook.py

import json
import requests
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required

WEBHOOK_URL = "https://dietpi.taild764a0.ts.net/webhook/gateway"
WEBHOOK_SECRET = '1v8Dp8Zx<5agP"V$m`}`1&Npt.\\:?"£V{vR]E(;(<JO?.v!0zY'

WEBHOOK_PAYLOAD = [
    {
        "id": "123",
        "route": "resume",
        "input": "a dude"
    }
]

@login_required
@require_POST
def trigger_webhook(request):
    try:
        response = requests.post(
            WEBHOOK_URL,
            headers={
                "Content-Type": "application/json",
                "X-Workflow-Secret": WEBHOOK_SECRET,
            },
            json=WEBHOOK_PAYLOAD,
            timeout=30,
        )
        try:
            data = response.json()
        except ValueError:
            data = response.text

        return JsonResponse({"success": True, "response": data}, status=200)

    except requests.exceptions.Timeout:
        return JsonResponse({"success": False, "response": "Request timed out."}, status=504)
    except requests.exceptions.ConnectionError:
        return JsonResponse({"success": False, "response": "Connection error."}, status=502)
    except Exception as e:
        return JsonResponse({"success": False, "response": str(e)}, status=500)