from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Feedback
from schemas import FeedbackCreate, FeedbackResponse, normalize_feedback_create

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackResponse, status_code=201)
def create_feedback(feedback_in: FeedbackCreate, db: Session = Depends(get_db)):
    try:
        normalized = normalize_feedback_create(feedback_in)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    feedback = Feedback(**normalized)
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return FeedbackResponse(success=True, feedback_id=str(feedback.id))
