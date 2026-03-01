from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

import uuid

from config import settings
from database import get_db
from models import EmailEvent, EmailJob, EmailSuppression


router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def _normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def _extract_event_type(payload: dict[str, Any]) -> str:
    t = payload.get("type") or payload.get("event") or payload.get("name")
    return str(t) if t else "unknown"


def _extract_resend_message_id(payload: dict[str, Any]) -> str | None:
    data = payload.get("data")
    if isinstance(data, dict):
        for key in ("email_id", "emailId", "id"):
            val = data.get(key)
            if val:
                return str(val)
    return None


def _extract_to_email(payload: dict[str, Any]) -> str | None:
    data = payload.get("data")
    if not isinstance(data, dict):
        return None

    to_val = data.get("to") or data.get("recipient") or data.get("email")
    if isinstance(to_val, list) and to_val:
        return str(to_val[0])
    if isinstance(to_val, str):
        return to_val
    return None


def _is_bounce_or_complaint(event_type: str) -> tuple[bool, str]:
    event_lower = event_type.lower()
    if "bounced" in event_lower or "bounce" in event_lower:
        return True, "bounce"
    if "complained" in event_lower or "complaint" in event_lower:
        return True, "complaint"
    return False, ""


def _verify_resend_webhook(payload_raw: str, headers: dict[str, str]) -> None:
    if not settings.resend_webhook_secret:
        raise HTTPException(status_code=500, detail="RESEND_WEBHOOK_SECRET not configured")
    try:
        from svix.webhooks import Webhook, WebhookVerificationError
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"svix not installed: {exc}")

    wh = Webhook(settings.resend_webhook_secret)
    try:
        wh.verify(payload_raw, headers)
    except WebhookVerificationError:
        raise HTTPException(status_code=401, detail="Invalid webhook signature")


@router.post("/resend")
async def resend_webhook(request: Request, db: Session = Depends(get_db)):
    raw = (await request.body()).decode("utf-8")

    required_headers = {
        "svix-id": request.headers.get("svix-id", ""),
        "svix-timestamp": request.headers.get("svix-timestamp", ""),
        "svix-signature": request.headers.get("svix-signature", ""),
    }
    _verify_resend_webhook(raw, required_headers)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = _extract_event_type(payload)
    resend_message_id = _extract_resend_message_id(payload)
    job_id: str | None = None

    if resend_message_id:
        job = db.query(EmailJob).filter(EmailJob.resend_message_id == resend_message_id).first()
        if job is not None:
            job_id = job.id

    event_row = EmailEvent(
        id=str(uuid.uuid4()),
        job_id=job_id,
        resend_message_id=resend_message_id,
        event_type=event_type,
        payload=payload,
    )
    db.add(event_row)

    should_suppress, reason = _is_bounce_or_complaint(event_type)
    if should_suppress:
        to_email = _normalize_email(_extract_to_email(payload))
        if to_email:
            existing = db.query(EmailSuppression).filter(EmailSuppression.email == to_email).first()
            if existing is None:
                db.add(
                    EmailSuppression(
                        email=to_email,
                        reason=reason,
                        source="resend_webhook",
                        meta={"event_type": event_type, "resend_message_id": resend_message_id},
                    )
                )

    db.commit()
    return {"success": True}
