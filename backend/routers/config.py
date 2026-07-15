from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from event_config import (
    EventNotFoundError,
    NoActiveEventError,
    get_config_for_event_id_from_db,
    get_config_from_db,
)

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("")
def get_event_config(
    event_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Public endpoint: returns the current event configuration."""
    try:
        if event_id is not None:
            return get_config_for_event_id_from_db(db, event_id)
        return get_config_from_db(db)
    except (EventNotFoundError, NoActiveEventError):
        raise HTTPException(status_code=404, detail="no_active_event")
