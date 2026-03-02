from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from database import get_db
from models import CateringRequest
from schemas import CateringRequestCreate, CateringRequestResponse

router = APIRouter(prefix="/api/catering-requests", tags=["catering"])

@router.post("", response_model=CateringRequestResponse)
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
            special_requests=request.special_requests
        )
        db.add(new_request)
        db.commit()
        db.refresh(new_request)
        return CateringRequestResponse(success=True, request_id=new_request.id)
    except SQLAlchemyError as err:
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Database error occurred while processing catering request"
        ) from err
