import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from database import get_db
from models import CateringRequest
from schemas import CateringRequestCreate, CateringRequestResponse
from services.email import send_new_catering_request_notification

router = APIRouter(prefix="/api/catering-requests", tags=["catering"])
logger = logging.getLogger(__name__)


@router.post(
    "",
    response_model=CateringRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_catering_request(
    request: CateringRequestCreate, db: Session = Depends(get_db)
):
    try:
        new_request = CateringRequest(
            first_name=request.first_name,
            last_name=request.last_name,
            email=request.email,
            phone_number=request.phone_number,
            event_date=request.event_date,
            guest_count=request.guest_count,
            event_type=request.event_type,
            budget_range=request.budget_range,
            special_requests=request.special_requests,
        )
        db.add(new_request)
        db.commit()
        db.refresh(new_request)
    except SQLAlchemyError as err:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Database error occurred while processing catering request",
        ) from err

    try:
        send_new_catering_request_notification(
            {
                "first_name": new_request.first_name,
                "last_name": new_request.last_name,
                "email": new_request.email,
                "phone_number": new_request.phone_number,
                "event_date": new_request.event_date,
                "guest_count": new_request.guest_count,
                "event_type": new_request.event_type,
                "budget_range": new_request.budget_range,
                "special_requests": new_request.special_requests,
            }
        )
    except Exception:
        logger.exception(
            "Failed to send new catering request notification for request %s",
            new_request.id,
        )

    return CateringRequestResponse(success=True, request_id=new_request.id)
