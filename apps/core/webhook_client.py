# apps/core/webhook_client.py

import logging
import time
import requests
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


# ── Configuration ──────────────────────────────────────────────────────────────

@dataclass
class WebhookConfig:
    url: str
    secret_header_name: str
    secret_header_value: str
    timeout: int = 30
    max_retries: int = 3
    retry_backoff_base: float = 1.5   # seconds: 1.5 → 2.25 → 3.375
    retryable_status_codes: tuple = (429, 500, 502, 503, 504)


# ── Result ─────────────────────────────────────────────────────────────────────

@dataclass
class WebhookResult:
    success: bool
    data: Any = None
    error: str = ""
    status_code: int = 0
    attempts: int = 0
    duration_ms: int = 0


# ── Client ─────────────────────────────────────────────────────────────────────

class WebhookClient:
    """
    Reusable webhook client with retry, backoff, and structured logging.
    Can be used from any Django app.

    Usage:
        from apps.core.webhook_client import WebhookClient, WebhookConfig

        config = WebhookConfig(url=..., secret_header_name=..., secret_header_value=...)
        client = WebhookClient(config)
        result = client.send(payload)
    """

    def __init__(self, config: WebhookConfig):
        self.config = config
        self._session = requests.Session()
        self._session.headers.update({
            "Content-Type": "application/json",
            config.secret_header_name: config.secret_header_value,
            "User-Agent": "Prof-App/1.0",
        })

    def send(self, payload: Any) -> WebhookResult:
        """
        Send payload to the webhook with automatic retry on transient failures.
        Returns a WebhookResult regardless of success/failure — never raises.
        """
        start = time.monotonic()
        attempts = 0
        last_error = ""
        last_status = 0

        for attempt in range(1, self.config.max_retries + 1):
            attempts = attempt
            try:
                logger.info(
                    "Webhook attempt %d/%d → %s",
                    attempt, self.config.max_retries, self.config.url
                )
                response = self._session.post(
                    self.config.url,
                    json=payload,
                    timeout=self.config.timeout,
                )
                last_status = response.status_code
                duration_ms = int((time.monotonic() - start) * 1000)

                # Retryable HTTP error
                if response.status_code in self.config.retryable_status_codes:
                    last_error = f"HTTP {response.status_code}"
                    logger.warning(
                        "Webhook attempt %d failed with %s. %s",
                        attempt,
                        response.status_code,
                        "Retrying…" if attempt < self.config.max_retries else "No more retries.",
                    )
                    if attempt < self.config.max_retries:
                        time.sleep(self.config.retry_backoff_base ** (attempt - 1))
                    continue

                # Non-retryable HTTP error (4xx except 429)
                if not response.ok:
                    last_error = f"HTTP {response.status_code}: {response.text[:200]}"
                    logger.error("Webhook non-retryable error: %s", last_error)
                    return WebhookResult(
                        success=False,
                        error=last_error,
                        status_code=last_status,
                        attempts=attempts,
                        duration_ms=duration_ms,
                    )

                # Success
                try:
                    data = response.json()
                except ValueError:
                    data = response.text

                logger.info(
                    "Webhook success after %d attempt(s) in %dms", attempts, duration_ms
                )
                return WebhookResult(
                    success=True,
                    data=data,
                    status_code=last_status,
                    attempts=attempts,
                    duration_ms=duration_ms,
                )

            except requests.exceptions.Timeout:
                last_error = f"Timeout after {self.config.timeout}s"
                logger.warning("Webhook attempt %d timed out.", attempt)
                if attempt < self.config.max_retries:
                    time.sleep(self.config.retry_backoff_base ** (attempt - 1))

            except requests.exceptions.ConnectionError as exc:
                last_error = f"Connection error: {exc}"
                logger.warning("Webhook attempt %d connection error: %s", attempt, exc)
                if attempt < self.config.max_retries:
                    time.sleep(self.config.retry_backoff_base ** (attempt - 1))

            except Exception as exc:
                last_error = f"Unexpected error: {exc}"
                logger.exception("Webhook unexpected error on attempt %d: %s", attempt, exc)
                break  # Don't retry on unknown errors

        duration_ms = int((time.monotonic() - start) * 1000)
        logger.error(
            "Webhook failed after %d attempt(s) in %dms. Last error: %s",
            attempts, duration_ms, last_error,
        )
        return WebhookResult(
            success=False,
            error=last_error,
            status_code=last_status,
            attempts=attempts,
            duration_ms=duration_ms,
        )