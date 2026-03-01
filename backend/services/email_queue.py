from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import uuid

from sqlalchemy.orm import Session
from sqlalchemy import or_

from config import settings
from constants import OrderStatus
from event_config import CURRENCY, get_event_date_for_event_id_from_db, get_etransfer_config_for_event_id_from_db
from models import EmailBatch, EmailJob, EmailSuppression, Event, Location, Order


EMAIL_TYPE_ORDER_CONFIRMATION = "order_confirmation"
EMAIL_TYPE_PICKUP_REMINDER = "pickup_reminder"

EMAIL_STATUS_QUEUED = "queued"
EMAIL_STATUS_SENDING = "sending"
EMAIL_STATUS_SENT = "sent"
EMAIL_STATUS_FAILED = "failed"
EMAIL_STATUS_SUPPRESSED = "suppressed"
EMAIL_STATUS_CANCELLED = "cancelled"


@dataclass(frozen=True)
class EnqueueResult:
    status: str
    message: str
    job: Optional[EmailJob]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def create_email_batch(db: Session, *, kind: str, created_by: str | None = None, meta: dict | None = None) -> EmailBatch:
    batch = EmailBatch(
        id=str(uuid.uuid4()),
        kind=kind,
        created_by=created_by,
        meta=meta or {},
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def _is_suppressed_email(db: Session, email: str) -> bool:
    normalized = _normalize_email(email)
    if not normalized:
        return False
    suppression = db.query(EmailSuppression).filter(EmailSuppression.email == normalized).first()
    return suppression is not None


def _upsert_job(db: Session, job: EmailJob) -> EmailJob:
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _existing_job_for_dedupe_key(db: Session, dedupe_key: str) -> EmailJob | None:
    return db.query(EmailJob).filter(EmailJob.dedupe_key == dedupe_key).first()


def _attach_job_to_batch(db: Session, job: EmailJob, batch_id: str | None) -> EmailJob:
    if not batch_id:
        return job
    if job.batch_id == batch_id:
        return job
    job.batch_id = batch_id
    job.updated_at = _utcnow()
    db.commit()
    db.refresh(job)
    return job


def _reuse_cancelled_job(
    db: Session,
    job: EmailJob,
    *,
    batch_id: str | None,
    status: str,
    to_email: str | None,
    payload: dict,
    last_error: str | None = None,
) -> EmailJob:
    now = _utcnow()
    job.batch_id = batch_id
    job.status = status
    job.to_email = to_email
    job.from_email = settings.from_email
    job.reply_to_email = settings.reply_to_email
    job.subject = None
    job.payload = payload
    job.resend_message_id = None
    job.sent_at = None
    job.attempt_count = 0
    job.max_attempts = int(settings.email_max_attempts)
    job.next_attempt_at = now
    job.locked_until = None
    job.locked_by = None
    job.last_error = last_error
    job.updated_at = now
    db.commit()
    db.refresh(job)
    return job


def enqueue_order_confirmation_result(
    db: Session,
    order_id: str,
    *,
    batch_id: str | None = None,
    force: bool = False,
) -> EnqueueResult:
    if not settings.email_queue_enabled:
        return EnqueueResult(status="failed_to_queue", message="Email queue disabled", job=None)

    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        return EnqueueResult(status="skipped_missing_order", message="Order not found", job=None)

    dedupe_key = f"{EMAIL_TYPE_ORDER_CONFIRMATION}:{order_id}"
    existing = _existing_job_for_dedupe_key(db, dedupe_key)

    if existing is not None and existing.status != EMAIL_STATUS_CANCELLED:
        # Dedupe key is unique, so even with force we cannot create a new job row.
        # Treat force as bypassing order-level guards, not dedupe.
        if force:
            if existing.status in {EMAIL_STATUS_QUEUED, EMAIL_STATUS_SENDING}:
                existing = _attach_job_to_batch(db, existing, batch_id)
                return EnqueueResult(status="already_queued", message="Already queued", job=existing)
            if existing.status == EMAIL_STATUS_SENT:
                return EnqueueResult(status="already_sent", message="Already sent", job=existing)
            if existing.status == EMAIL_STATUS_SUPPRESSED:
                return EnqueueResult(status="suppressed", message="Suppressed", job=existing)
            if existing.status == EMAIL_STATUS_FAILED:
                return EnqueueResult(status="failed_to_queue", message="Previous job failed. Retry the job.", job=existing)
            return EnqueueResult(status="already_queued", message="Already queued", job=existing)

    if existing is not None and existing.status != EMAIL_STATUS_CANCELLED and not force:
        if existing.status in {EMAIL_STATUS_QUEUED, EMAIL_STATUS_SENDING}:
            existing = _attach_job_to_batch(db, existing, batch_id)
            return EnqueueResult(status="already_queued", message="Already queued", job=existing)
        if existing.status == EMAIL_STATUS_SENT:
            return EnqueueResult(status="already_sent", message="Already sent", job=existing)
        if existing.status == EMAIL_STATUS_SUPPRESSED:
            return EnqueueResult(status="suppressed", message="Suppressed", job=existing)
        if existing.status == EMAIL_STATUS_FAILED:
            return EnqueueResult(status="failed_to_queue", message="Previous job failed. Retry the job.", job=existing)
        return EnqueueResult(status="already_queued", message="Already queued", job=existing)

    if order.exclude_email:
        to_email = _normalize_email(order.email)
        if existing is not None and existing.status == EMAIL_STATUS_CANCELLED:
            reused = _reuse_cancelled_job(
                db,
                existing,
                batch_id=batch_id,
                status=EMAIL_STATUS_SUPPRESSED,
                to_email=to_email,
                payload={},
                last_error=None,
            )
            return EnqueueResult(status="suppressed", message="Email excluded", job=reused)

        job = EmailJob(
            id=str(uuid.uuid4()),
            batch_id=batch_id,
            email_type=EMAIL_TYPE_ORDER_CONFIRMATION,
            status=EMAIL_STATUS_SUPPRESSED,
            dedupe_key=dedupe_key,
            order_id=order_id,
            to_email=to_email,
            from_email=settings.from_email,
            reply_to_email=settings.reply_to_email,
            payload={},
            max_attempts=settings.email_max_attempts,
            next_attempt_at=_utcnow(),
            updated_at=_utcnow(),
        )
        return EnqueueResult(status="suppressed", message="Email excluded", job=_upsert_job(db, job))

    to_email = _normalize_email(order.email)
    if not to_email:
        return EnqueueResult(status="skipped_missing_email", message="Missing email", job=None)

    # If a cancelled job exists for this dedupe key, reuse it to avoid violating the
    # uq_email_jobs_dedupe_key constraint.

    if not settings.email_enabled:
        if existing is not None and existing.status == EMAIL_STATUS_CANCELLED:
            reused = _reuse_cancelled_job(
                db,
                existing,
                batch_id=batch_id,
                status=EMAIL_STATUS_SUPPRESSED,
                to_email=to_email,
                payload={},
                last_error="Email delivery disabled by EMAIL_ENABLED=false",
            )
            return EnqueueResult(status="suppressed", message="Email disabled", job=reused)

        job = EmailJob(
            id=str(uuid.uuid4()),
            batch_id=batch_id,
            email_type=EMAIL_TYPE_ORDER_CONFIRMATION,
            status=EMAIL_STATUS_SUPPRESSED,
            dedupe_key=dedupe_key,
            order_id=order_id,
            to_email=to_email,
            from_email=settings.from_email,
            reply_to_email=settings.reply_to_email,
            payload={},
            max_attempts=settings.email_max_attempts,
            last_error="Email delivery disabled by EMAIL_ENABLED=false",
            next_attempt_at=_utcnow(),
            updated_at=_utcnow(),
        )
        return EnqueueResult(status="suppressed", message="Email disabled", job=_upsert_job(db, job))

    if _is_suppressed_email(db, to_email):
        if existing is not None and existing.status == EMAIL_STATUS_CANCELLED:
            reused = _reuse_cancelled_job(
                db,
                existing,
                batch_id=batch_id,
                status=EMAIL_STATUS_SUPPRESSED,
                to_email=to_email,
                payload={},
                last_error="Suppressed by email_suppressions",
            )
            return EnqueueResult(status="suppressed", message="Suppressed", job=reused)

        job = EmailJob(
            id=str(uuid.uuid4()),
            batch_id=batch_id,
            email_type=EMAIL_TYPE_ORDER_CONFIRMATION,
            status=EMAIL_STATUS_SUPPRESSED,
            dedupe_key=dedupe_key,
            order_id=order_id,
            to_email=to_email,
            from_email=settings.from_email,
            reply_to_email=settings.reply_to_email,
            payload={},
            max_attempts=settings.email_max_attempts,
            last_error="Suppressed by email_suppressions",
            next_attempt_at=_utcnow(),
            updated_at=_utcnow(),
        )
        return EnqueueResult(status="suppressed", message="Suppressed", job=_upsert_job(db, job))

    payload = _build_order_email_payload(db, order)
    if existing is not None and existing.status == EMAIL_STATUS_CANCELLED:
        reused = _reuse_cancelled_job(
            db,
            existing,
            batch_id=batch_id,
            status=EMAIL_STATUS_QUEUED,
            to_email=to_email,
            payload=payload,
            last_error=None,
        )
        return EnqueueResult(status="queued", message="Queued", job=reused)

    job = EmailJob(
        id=str(uuid.uuid4()),
        batch_id=batch_id,
        email_type=EMAIL_TYPE_ORDER_CONFIRMATION,
        status=EMAIL_STATUS_QUEUED,
        dedupe_key=dedupe_key,
        order_id=order_id,
        to_email=to_email,
        from_email=settings.from_email,
        reply_to_email=settings.reply_to_email,
        payload=payload,
        max_attempts=settings.email_max_attempts,
        next_attempt_at=_utcnow(),
        updated_at=_utcnow(),
    )
    try:
        return EnqueueResult(status="queued", message="Queued", job=_upsert_job(db, job))
    except Exception as exc:
        return EnqueueResult(status="failed_to_queue", message=str(exc), job=None)


def enqueue_pickup_reminder_result(
    db: Session,
    order_id: str,
    *,
    batch_id: str | None = None,
    force: bool = False,
) -> EnqueueResult:
    if not settings.email_queue_enabled:
        return EnqueueResult(status="failed_to_queue", message="Email queue disabled", job=None)

    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        return EnqueueResult(status="skipped_missing_order", message="Order not found", job=None)

    if order.status != OrderStatus.CONFIRMED:
        return EnqueueResult(status="skipped_not_confirmed", message="Only confirmed orders can be reminded", job=None)

    if order.exclude_email:
        return EnqueueResult(status="skipped_excluded", message="Excluded from email", job=None)

    to_email = _normalize_email(order.email)
    if not to_email:
        return EnqueueResult(status="skipped_missing_email", message="Missing email", job=None)

    dedupe_key = f"{EMAIL_TYPE_PICKUP_REMINDER}:{order_id}"

    existing = _existing_job_for_dedupe_key(db, dedupe_key)

    if existing is not None and existing.status != EMAIL_STATUS_CANCELLED:
        # Dedupe key is unique, so even with force we cannot create a new job row.
        # Treat force as bypassing order-level guards, not dedupe.
        if force:
            if existing.status == EMAIL_STATUS_SENT:
                order.reminded = True
                db.commit()
                return EnqueueResult(status="skipped_already_reminded", message="Already reminded", job=existing)
            if existing.status == EMAIL_STATUS_SUPPRESSED:
                order.reminded = True
                db.commit()
                return EnqueueResult(status="suppressed", message="Suppressed", job=existing)
            if existing.status in {EMAIL_STATUS_QUEUED, EMAIL_STATUS_SENDING}:
                existing = _attach_job_to_batch(db, existing, batch_id)
                order.reminded = True
                db.commit()
                return EnqueueResult(status="already_queued", message="Already queued", job=existing)
            if existing.status == EMAIL_STATUS_FAILED:
                return EnqueueResult(status="failed_to_queue", message="Previous job failed. Retry the job.", job=existing)
            return EnqueueResult(status="already_queued", message="Already queued", job=existing)

    if existing is not None and existing.status != EMAIL_STATUS_CANCELLED and not force:
        if existing.status == EMAIL_STATUS_SENT:
            order.reminded = True
            db.commit()
            return EnqueueResult(status="skipped_already_reminded", message="Already reminded", job=existing)
        if existing.status == EMAIL_STATUS_SUPPRESSED:
            order.reminded = True
            db.commit()
            return EnqueueResult(status="suppressed", message="Suppressed", job=existing)
        if existing.status in {EMAIL_STATUS_QUEUED, EMAIL_STATUS_SENDING}:
            existing = _attach_job_to_batch(db, existing, batch_id)
            order.reminded = True
            db.commit()
            return EnqueueResult(status="already_queued", message="Already queued", job=existing)
        if existing.status == EMAIL_STATUS_FAILED:
            return EnqueueResult(status="failed_to_queue", message="Previous job failed. Retry the job.", job=existing)
        return EnqueueResult(status="already_queued", message="Already queued", job=existing)

    # If order.reminded is set but the only job is cancelled, allow re-queue.
    if existing is not None and existing.status == EMAIL_STATUS_CANCELLED and order.reminded:
        order.reminded = False
        db.commit()

    if order.reminded and not force:
        return EnqueueResult(status="skipped_already_reminded", message="Already reminded", job=None)

    if not settings.email_enabled:
        if existing is not None and existing.status == EMAIL_STATUS_CANCELLED:
            reused = _reuse_cancelled_job(
                db,
                existing,
                batch_id=batch_id,
                status=EMAIL_STATUS_SUPPRESSED,
                to_email=to_email,
                payload={},
                last_error="Email delivery disabled by EMAIL_ENABLED=false",
            )
            order.reminded = True
            db.commit()
            return EnqueueResult(status="suppressed", message="Email disabled", job=reused)

        job = EmailJob(
            id=str(uuid.uuid4()),
            batch_id=batch_id,
            email_type=EMAIL_TYPE_PICKUP_REMINDER,
            status=EMAIL_STATUS_SUPPRESSED,
            dedupe_key=dedupe_key,
            order_id=order_id,
            to_email=to_email,
            from_email=settings.from_email,
            reply_to_email=settings.reply_to_email,
            payload={},
            max_attempts=settings.email_max_attempts,
            last_error="Email delivery disabled by EMAIL_ENABLED=false",
            next_attempt_at=_utcnow(),
            updated_at=_utcnow(),
        )
        order.reminded = True
        db.commit()
        return EnqueueResult(status="suppressed", message="Email disabled", job=_upsert_job(db, job))

    if _is_suppressed_email(db, to_email):
        if existing is not None and existing.status == EMAIL_STATUS_CANCELLED:
            reused = _reuse_cancelled_job(
                db,
                existing,
                batch_id=batch_id,
                status=EMAIL_STATUS_SUPPRESSED,
                to_email=to_email,
                payload={},
                last_error="Suppressed by email_suppressions",
            )
            order.reminded = True
            db.commit()
            return EnqueueResult(status="suppressed", message="Suppressed", job=reused)

        job = EmailJob(
            id=str(uuid.uuid4()),
            batch_id=batch_id,
            email_type=EMAIL_TYPE_PICKUP_REMINDER,
            status=EMAIL_STATUS_SUPPRESSED,
            dedupe_key=dedupe_key,
            order_id=order_id,
            to_email=to_email,
            from_email=settings.from_email,
            reply_to_email=settings.reply_to_email,
            payload={},
            max_attempts=settings.email_max_attempts,
            last_error="Suppressed by email_suppressions",
            next_attempt_at=_utcnow(),
            updated_at=_utcnow(),
        )
        order.reminded = True
        db.commit()
        return EnqueueResult(status="suppressed", message="Suppressed", job=_upsert_job(db, job))

    payload = _build_order_email_payload(db, order, reminder=True)
    if existing is not None and existing.status == EMAIL_STATUS_CANCELLED:
        saved = _reuse_cancelled_job(
            db,
            existing,
            batch_id=batch_id,
            status=EMAIL_STATUS_QUEUED,
            to_email=to_email,
            payload=payload,
            last_error=None,
        )
    else:
        job = EmailJob(
            id=str(uuid.uuid4()),
            batch_id=batch_id,
            email_type=EMAIL_TYPE_PICKUP_REMINDER,
            status=EMAIL_STATUS_QUEUED,
            dedupe_key=dedupe_key,
            order_id=order_id,
            to_email=to_email,
            from_email=settings.from_email,
            reply_to_email=settings.reply_to_email,
            payload=payload,
            max_attempts=settings.email_max_attempts,
            next_attempt_at=_utcnow(),
            updated_at=_utcnow(),
        )
        try:
            saved = _upsert_job(db, job)
        except Exception as exc:
            return EnqueueResult(status="failed_to_queue", message=str(exc), job=None)

    order.reminded = True
    db.commit()
    return EnqueueResult(status="queued", message="Queued", job=saved)


def enqueue_order_confirmation(
    db: Session,
    order_id: str,
    *,
    batch_id: str | None = None,
    force: bool = False,
) -> EmailJob | None:
    return enqueue_order_confirmation_result(db, order_id, batch_id=batch_id, force=force).job


def enqueue_pickup_reminder(
    db: Session,
    order_id: str,
    *,
    batch_id: str | None = None,
    force: bool = False,
) -> EmailJob | None:
    return enqueue_pickup_reminder_result(db, order_id, batch_id=batch_id, force=force).job


def _build_order_email_payload(db: Session, order: Order, *, reminder: bool = False) -> dict:
    event_date = ""
    etransfer = {"enabled": False, "email": None}

    if getattr(order, "event_id", None) is not None:
        try:
            event_date = get_event_date_for_event_id_from_db(db, int(order.event_id))
        except Exception:
            event_date = ""
        try:
            etransfer = get_etransfer_config_for_event_id_from_db(db, int(order.event_id))
        except Exception:
            etransfer = {"enabled": False, "email": None}

    if not event_date:
        event = db.query(Event).filter(Event.is_active == True).first()
        event_date = event.event_date if event else ""
        if event is not None:
            etransfer = {
                "enabled": bool(event.etransfer_enabled),
                "email": event.etransfer_email,
            }

    location = db.query(Location).filter(
        or_(Location.name == order.pickup_location, Location.id == order.pickup_location)
    ).first()
    address = location.address if location else ""

    effective_price = (float(order.total_price) / order.quantity) if order.quantity else 0.0

    return {
        "name": order.name,
        "item_id": order.item_id,
        "item_name": order.item_name,
        "quantity": order.quantity,
        "pickup_location": order.pickup_location,
        "pickup_time_slot": order.pickup_time_slot,
        "phone_number": order.phone_number,
        "email": _normalize_email(order.email),
        "total_price": float(order.total_price),
        "price_per_item": effective_price,
        "currency": CURRENCY,
        "address": address,
        "event_date": event_date,
        "etransfer_enabled": bool(etransfer.get("enabled")),
        "etransfer_email": etransfer.get("email"),
        "reminder": reminder,
    }
