from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import resend
from resend.exceptions import ResendError

from config import settings


resend.api_key = settings.resend_api_key


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
) -> SendEmailResult:
    try:
        message_payload: dict[str, Any] = {
            "from": f"Loku Caters <{from_email}>",
            "to": [to_email],
            "subject": subject,
            "html": html,
        }
        if reply_to_email:
            message_payload["reply_to"] = reply_to_email
        if tags:
            message_payload["tags"] = tags
        resp = resend.Emails.send(message_payload)
        resend_message_id = getattr(resp, "id", None)
        if not resend_message_id:
            raise SendEmailFailure(message="Resend send succeeded but returned no id", retryable=True)
        return SendEmailResult(resend_message_id=str(resend_message_id))
    except ResendError as exc:
        code = getattr(exc, "code", None)
        retryable = _is_retryable_status(code)
        raise SendEmailFailure(message=str(exc), code=code, retryable=retryable) from exc
    except Exception as exc:
        raise SendEmailFailure(message=str(exc), code=None, retryable=True) from exc

