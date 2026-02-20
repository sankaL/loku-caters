from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from event_config import get_config_from_db

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("")
def get_event_config(db: Session = Depends(get_db)):
    """Public endpoint: returns the current event configuration."""
    return get_config_from_db(db)
