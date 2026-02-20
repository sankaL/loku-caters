from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from config import settings

# Auto-map postgresql:// → postgresql+pg8000:// so the .env URL works as-is
_url = settings.database_url
if _url.startswith("postgresql://") and "+pg8000" not in _url:
    _url = _url.replace("postgresql://", "postgresql+pg8000://", 1)

engine = create_engine(_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
