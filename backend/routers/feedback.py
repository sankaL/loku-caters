import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Feedback
from schemas import FeedbackCreate, FeedbackResponse, normalize_feedback_create
from services.email import send_new_feedback_notification

router = APIRouter(prefix="/api/feedback", tags=["feedback"])
logger = logging.getLogger(__name__)


@router.post("", response_model=FeedbackResponse, status_code=201)
def create_feedback(feedback_in: FeedbackCreate, db: Session = Depends(get_db)):
    if feedback_in.origin == "admin_submission":
        raise HTTPException(status_code=403, detail="Invalid feedback origin")

    try:
        normalized = normalize_feedback_create(feedback_in)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    feedback = Feedback(**normalized)
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    try:
        send_new_feedback_notification(normalized)
    except Exception:
        logger.exception(
            "Failed to send new feedback notification for feedback %s", feedback.id
        )
    return FeedbackResponse(success=True, feedback_id=str(feedback.id))


@router.get("/reviews")
def get_public_reviews(db: Session = Depends(get_db)):
    rows = (
        db.query(Feedback)
        .filter(Feedback.show_in_reviews.is_(True))
        .order_by(Feedback.created_at.desc())
        .all()
    )
    return [
        {
            "id": row.id,
            "name": row.name,
            "message": row.message,
            "rating": row.rating,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
