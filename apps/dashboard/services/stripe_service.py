import logging

import requests
from django.conf import settings
from stripe import StripeClient


logger = logging.getLogger(__name__)


class StripeConfigurationError(RuntimeError):
    pass


class BalanceCreditError(RuntimeError):
    pass


def create_balance_checkout_session(
    *,
    user_id,
    email,
    amount_cents,
    success_url,
    cancel_url,
):
    if not settings.STRIPE_SECRET_KEY:
        raise StripeConfigurationError('Stripe secret key is not configured.')

    client = StripeClient(
        settings.STRIPE_SECRET_KEY,
        max_network_retries=2,
    )

    metadata = {
        'purpose': 'balance_top_up',
        'user_id': str(user_id),
        'user_email': email,
        'amount_cents': str(amount_cents),
    }

    return client.v1.checkout.sessions.create({
        'mode': 'payment',
        'customer_email': email,
        'client_reference_id': str(user_id),
        'line_items': [
            {
                'price_data': {
                    'currency': 'usd',
                    'unit_amount': amount_cents,
                    'product_data': {
                        'name': 'Prof account balance',
                    },
                },
                'quantity': 1,
            },
        ],
        'metadata': metadata,
        'payment_intent_data': {
            'metadata': metadata,
        },
        'success_url': success_url,
        'cancel_url': cancel_url,
    })


def credit_balance_from_checkout_session(session, event_id):
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise StripeConfigurationError('Supabase credentials are not configured.')

    session_data = (
        session.to_dict()
        if hasattr(session, 'to_dict')
        else dict(session)
    )

    metadata = session_data.get('metadata') or {}

    if metadata.get('purpose') != 'balance_top_up':
        return False

    email = metadata.get('user_email')
    checkout_session_id = session_data.get('id')
    payment_intent_id = session_data.get('payment_intent')
    amount_cents = session_data.get('amount_total')
    currency = (session_data.get('currency') or '').lower()
    payment_status = session_data.get('payment_status')

    if payment_status != 'paid':
        return False

    if not email or not checkout_session_id or not amount_cents:
        raise BalanceCreditError('Stripe Checkout Session is missing required data.')

    if currency != 'usd':
        raise BalanceCreditError('Unsupported Stripe payment currency.')

    payload = {
        'p_email': email,
        'p_amount_cents': amount_cents,
        'p_currency': currency,
        'p_event_id': event_id,
        'p_checkout_session_id': checkout_session_id,
        'p_payment_intent_id': payment_intent_id,
    }

    key = settings.SUPABASE_SERVICE_ROLE_KEY

    try:
        response = requests.post(
            f'{settings.SUPABASE_URL}/rest/v1/rpc/credit_user_balance_from_stripe',
            json=payload,
            headers={
                'apikey': key,
                'Authorization': f'Bearer {key}',
                'Content-Type': 'application/json',
            },
            timeout=15,
        )
    except requests.RequestException as exc:
        raise BalanceCreditError(
            'Could not reach Supabase while crediting balance.'
        ) from exc

    if not response.ok:
        logger.error(
            'Supabase balance credit RPC failed with status %s.',
            response.status_code,
        )
        raise BalanceCreditError(
            'Supabase rejected the balance credit operation.'
        )

    return True