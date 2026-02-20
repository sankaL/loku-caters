from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from config import settings

def get_database_url() -> str:
    # Auto-map postgresql:// to postgresql+pg8000:// so env URLs work as-is.
    database_url = settings.database_url
    if database_url.startswith("postgresql://") and "+pg8000" not in database_url:
        database_url = database_url.replace("postgresql://", "postgresql+pg8000://", 1)
    return database_url


engine = create_engine(get_database_url(), pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
