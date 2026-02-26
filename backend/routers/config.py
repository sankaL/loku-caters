from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from event_config import NoActiveEventError, get_config_from_db

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("")
def get_event_config(db: Session = Depends(get_db)):
    """Public endpoint: returns the current event configuration."""
    try:
        return get_config_from_db(db)
    except NoActiveEventError:
        raise HTTPException(status_code=404, detail="no_active_event")
