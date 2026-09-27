import json
import logging
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from stripe import (
    SignatureVerificationError,
    StripeError,
    Webhook,
)

from apps.dashboard.services.stripe_service import (
    BalanceCreditError,
    StripeConfigurationError,
    create_balance_checkout_session,
    credit_balance_from_checkout_session,
)


logger = logging.getLogger(__name__)

MIN_TOP_UP_AMOUNT = Decimal('1.00')
MAX_TOP_UP_AMOUNT = Decimal('10000.00')
CENT = Decimal('0.01')


@login_required
@require_POST
def create_balance_checkout_session_view(request):
    try:
        body = json.loads(request.body or b'{}')
        amount = Decimal(str(body.get('amount', '')))
    except (json.JSONDecodeError, InvalidOperation, TypeError, ValueError):
        return JsonResponse({'error': 'Invalid amount.'}, status=400)

    if not amount.is_finite():
        return JsonResponse({'error': 'Invalid amount.'}, status=400)

    try:
        normalized_amount = amount.quantize(CENT)
    except InvalidOperation:
        return JsonResponse({'error': 'Invalid amount.'}, status=400)

    if amount != normalized_amount:
        return JsonResponse(
            {'error': 'Amount can have at most two decimal places.'},
            status=400,
        )

    if not MIN_TOP_UP_AMOUNT <= normalized_amount <= MAX_TOP_UP_AMOUNT:
        return JsonResponse(
            {'error': 'Amount must be between $1.00 and $10,000.00.'},
            status=400,
        )

    if not request.user.email:
        return JsonResponse(
            {'error': 'Your account does not have an email address.'},
            status=400,
        )

    amount_cents = int(normalized_amount * 100)

    dashboard_url = request.build_absolute_uri(
        reverse('dashboard:index')
    )

    try:
        session = create_balance_checkout_session(
            user_id=request.user.id,
            email=request.user.email,
            amount_cents=amount_cents,
            success_url=f'{dashboard_url}?funds=success',
            cancel_url=f'{dashboard_url}?funds=cancelled',
        )
    except StripeConfigurationError as exc:
        logger.error('Stripe configuration error: %s', exc)
        return JsonResponse(
            {'error': 'Payments are not configured.'},
            status=503,
        )
    except StripeError as exc:
        logger.error(
            'Stripe Checkout Session creation failed for user %s: %s',
            request.user.id,
            exc,
        )
        return JsonResponse(
            {'error': 'Could not start the Stripe payment.'},
            status=502,
        )

    if not session.url:
        logger.error(
            'Stripe Checkout Session %s returned without a URL.',
            session.id,
        )
        return JsonResponse(
            {'error': 'Stripe did not return a checkout URL.'},
            status=502,
        )

    return JsonResponse({
        'checkout_url': session.url,
    })


@csrf_exempt
@require_POST
def stripe_webhook(request):
    if not settings.STRIPE_WEBHOOK_SECRET:
        logger.error('Stripe webhook secret is not configured.')
        return JsonResponse(
            {'error': 'Webhook is not configured.'},
            status=503,
        )

    signature = request.headers.get('Stripe-Signature', '')

    try:
        event = Webhook.construct_event(
            request.body,
            signature,
            settings.STRIPE_WEBHOOK_SECRET,
        )
    except (ValueError, SignatureVerificationError):
        return JsonResponse(
            {'error': 'Invalid webhook signature.'},
            status=400,
        )

    event_type = event['type']

    if event_type in {
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
    }:
        session = event['data']['object']

        try:
            credit_balance_from_checkout_session(
                session=session,
                event_id=event['id'],
            )
        except (BalanceCreditError, StripeConfigurationError) as exc:
            logger.error(
                'Stripe balance fulfillment failed for event %s: %s',
                event['id'],
                exc,
            )

            return JsonResponse(
                {'error': 'Balance fulfillment failed.'},
                status=500,
            )

    return JsonResponse({'received': True})