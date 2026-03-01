from __future__ import annotations

from dataclasses import dataclass

import httpx

from config import settings


@dataclass(frozen=True)
class SendEmailResult:
    resend_message_id: str


@dataclass(frozen=True)
class SendEmailFailure(Exception):
    message: str
    code: str | int | None = None
    retryable: bool = False


def _is_retryable_status(code: str | int | None) -> bool:
    try:
        code_int = int(code) if code is not None else None
    except (TypeError, ValueError):
        return False
    if code_int == 429:
        return True
    if 500 <= code_int <= 599:
        return True
    return False


def send_email_via_resend(
    *,
    from_email: str,
    to_email: str,
    subject: str,
    html: str,
    reply_to_email: str | None,
    tags: list[dict[str, str]] | None = None,
    idempotency_key: str | None = None,
) -> SendEmailResult:
    headers: dict[str, str] = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key

    payload: dict = {
        "from": f"Loku Caters <{from_email}>",
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    if reply_to_email:
        payload["reply_to"] = reply_to_email
    if tags:
        payload["tags"] = tags

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post("https://api.resend.com/emails", headers=headers, json=payload)

        if resp.status_code >= 400:
            try:
                body = resp.json()
                message = body.get("message", resp.text)
            except Exception:
                message = resp.text
            retryable = _is_retryable_status(resp.status_code)
            raise SendEmailFailure(message=message, code=resp.status_code, retryable=retryable)

        data = resp.json()
        resend_message_id = data.get("id")
        if not resend_message_id:
            # Email was accepted by Resend but returned no ID -- treat as non-retryable to avoid
            # sending a duplicate. Log a placeholder so the job can be marked SENT.
            return SendEmailResult(resend_message_id="unknown")
        return SendEmailResult(resend_message_id=str(resend_message_id))

    except SendEmailFailure:
        raise
    except Exception as exc:
        raise SendEmailFailure(message=str(exc), code=None, retryable=True) from exc
