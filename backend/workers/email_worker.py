from __future__ import annotations

import os
import random
import socket
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from config import settings
from database import SessionLocal, engine
from models import EmailJob, EmailSuppression
from services.email_sender import SendEmailFailure, send_email_via_resend
from services.email_templates import (
    render_order_confirmation_email,
    render_pickup_reminder_email,
)
from services.email_queue import (
    EMAIL_STATUS_CANCELLED,
    EMAIL_STATUS_FAILED,
    EMAIL_STATUS_QUEUED,
    EMAIL_STATUS_SENDING,
    EMAIL_STATUS_SENT,
    EMAIL_STATUS_SUPPRESSED,
    EMAIL_TYPE_ORDER_CONFIRMATION,
    EMAIL_TYPE_PICKUP_REMINDER,
)


WORKER_ID = f"{socket.gethostname()}:{os.getpid()}"
ADVISORY_LOCK_KEY = 84521031


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _sleep_seconds(seconds: float) -> None:
    if seconds <= 0:
        return
    time.sleep(seconds)


def _enforce_rate_limit(last_send_at: datetime | None) -> datetime:
    rate = max(1, int(settings.email_send_rate_per_second))
    min_interval = 1.0 / float(rate)

    now = _utcnow()
    if last_send_at is None:
        return now

    elapsed = (now - last_send_at).total_seconds()
    if elapsed < min_interval:
        _sleep_seconds(min_interval - elapsed)
    return _utcnow()


def _compute_backoff_seconds(*, attempt_count: int, resend_code: str | int | None) -> float:
    base = 2.0
    cap = 15.0 * 60.0
    jitter = random.random()

    exponent = max(0, attempt_count - 1)
    delay = base * (2.0 ** float(exponent))
    delay = min(delay, cap)

    try:
        code_int = int(resend_code) if resend_code is not None else None
    except (TypeError, ValueError):
        code_int = None
    if code_int == 429:
        delay = max(delay, 60.0)

    return min(delay + jitter, cap)


def _is_suppressed(db: Session, to_email: str | None) -> bool:
    email_norm = (to_email or "").strip().lower()
    if not email_norm:
        return False
    row = db.query(EmailSuppression).filter(EmailSuppression.email == email_norm).first()
    return row is not None


def _lease_next_job(db: Session) -> EmailJob | None:
    now = _utcnow()
    lock_until = now + timedelta(seconds=int(settings.email_lock_seconds))

    job = (
        db.query(EmailJob)
        .filter(
            EmailJob.status.in_([EMAIL_STATUS_QUEUED, EMAIL_STATUS_SENDING]),
            EmailJob.next_attempt_at <= now,
            or_(
                EmailJob.status == EMAIL_STATUS_QUEUED,
                EmailJob.locked_until.is_(None),
                EmailJob.locked_until < now,
            ),
        )
        .order_by(EmailJob.next_attempt_at.asc(), EmailJob.created_at.asc())
        .with_for_update(skip_locked=True)
        .first()
    )
    if job is None:
        return None

    job.status = EMAIL_STATUS_SENDING
    job.locked_by = WORKER_ID
    job.locked_until = lock_until
    job.updated_at = now
    db.commit()
    db.refresh(job)
    return job


def _mark_job_terminal(db: Session, job: EmailJob, *, status: str, last_error: str | None = None) -> None:
    now = _utcnow()
    job.status = status
    job.last_error = last_error
    job.locked_by = None
    job.locked_until = None
    job.updated_at = now
    db.commit()


def _render_for_job(job: EmailJob) -> tuple[str, str]:
    payload = job.payload or {}
    context = payload  # type: ignore[assignment]

    if job.email_type == EMAIL_TYPE_ORDER_CONFIRMATION:
        rendered = render_order_confirmation_email(context)  # type: ignore[arg-type]
        return rendered["subject"], rendered["html"]
    if job.email_type == EMAIL_TYPE_PICKUP_REMINDER:
        rendered = render_pickup_reminder_email(context)  # type: ignore[arg-type]
        return rendered["subject"], rendered["html"]

    raise ValueError(f"Unknown email job type: {job.email_type}")


def _process_job(db: Session, job: EmailJob, *, last_send_at: datetime | None) -> datetime | None:
    if job.status != EMAIL_STATUS_SENDING:
        return last_send_at

    if not settings.email_queue_enabled:
        _mark_job_terminal(db, job, status=EMAIL_STATUS_CANCELLED, last_error="Email queue disabled")
        return last_send_at

    if not settings.email_enabled:
        _mark_job_terminal(db, job, status=EMAIL_STATUS_SUPPRESSED, last_error="Email delivery disabled by EMAIL_ENABLED=false")
        return last_send_at

    if _is_suppressed(db, job.to_email):
        _mark_job_terminal(db, job, status=EMAIL_STATUS_SUPPRESSED, last_error="Suppressed by email_suppressions")
        return last_send_at

    to_email = (job.to_email or "").strip().lower()
    if not to_email:
        _mark_job_terminal(db, job, status=EMAIL_STATUS_FAILED, last_error="Missing to_email")
        return last_send_at

    try:
        subject, html = _render_for_job(job)
    except Exception as exc:
        _mark_job_terminal(db, job, status=EMAIL_STATUS_FAILED, last_error=str(exc))
        return last_send_at

    last_send_at = _enforce_rate_limit(last_send_at)

    # Freshness check -- re-read from DB to confirm we still own this job before sending
    fresh = db.query(EmailJob).filter(EmailJob.id == job.id).first()
    if fresh is None or fresh.status != EMAIL_STATUS_SENDING or fresh.locked_by != WORKER_ID:
        return last_send_at  # Another worker handled it or status changed

    try:
        result = send_email_via_resend(
            from_email=job.from_email,
            to_email=to_email,
            subject=subject,
            html=html,
            reply_to_email=job.reply_to_email,
            tags=[
                {"name": "job_id", "value": job.id},
                {"name": "type", "value": job.email_type},
            ],
            idempotency_key=job.id,
        )
        now = _utcnow()
        job.status = EMAIL_STATUS_SENT
        job.subject = subject
        job.resend_message_id = result.resend_message_id
        job.sent_at = now
        job.locked_by = None
        job.locked_until = None
        job.updated_at = now
        db.commit()
        return last_send_at
    except SendEmailFailure as exc:
        now = _utcnow()
        job.attempt_count = int(job.attempt_count) + 1
        job.last_error = exc.message
        job.locked_by = None
        job.locked_until = None
        job.updated_at = now

        if not exc.retryable:
            job.status = EMAIL_STATUS_FAILED
            db.commit()
            return last_send_at

        if job.attempt_count >= int(job.max_attempts):
            job.status = EMAIL_STATUS_FAILED
            db.commit()
            return last_send_at

        backoff = _compute_backoff_seconds(attempt_count=job.attempt_count, resend_code=exc.code)
        job.status = EMAIL_STATUS_QUEUED
        job.next_attempt_at = now + timedelta(seconds=float(backoff))
        db.commit()
        return last_send_at


def main() -> None:
    with engine.connect() as conn:
        got_lock = conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": ADVISORY_LOCK_KEY}).scalar()
        if not got_lock:
            print("[email-worker] Another worker holds the advisory lock. Exiting.")
            raise SystemExit(1)

        print(f"[email-worker] Started. worker_id={WORKER_ID} rate={settings.email_send_rate_per_second}/sec")

        last_send_at: datetime | None = None
        poll_seconds = max(0.05, float(settings.email_poll_interval_ms) / 1000.0)

        while True:
            db = SessionLocal()
            try:
                job = _lease_next_job(db)
                if job is None:
                    _sleep_seconds(poll_seconds)
                    continue

                last_send_at = _process_job(db, job, last_send_at=last_send_at)
            except KeyboardInterrupt:
                print("[email-worker] Stopping.")
                return
            except Exception as exc:
                print(f"[email-worker] Error: {exc}")
                _sleep_seconds(0.5)
            finally:
                db.close()


if __name__ == "__main__":
    main()
