from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Feedback
from schemas import FeedbackCreate, FeedbackResponse

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackResponse, status_code=201)
def create_feedback(feedback_in: FeedbackCreate, db: Session = Depends(get_db)):
    feedback = Feedback(
        feedback_type=feedback_in.feedback_type,
        order_id=feedback_in.order_id,
        name=feedback_in.name,
        contact=feedback_in.contact,
        reason=feedback_in.reason,
        other_details=feedback_in.other_details,
        message=feedback_in.message,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return FeedbackResponse(success=True, feedback_id=str(feedback.id))
