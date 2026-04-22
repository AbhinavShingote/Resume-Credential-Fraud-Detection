"""SQLAlchemy engine, session factory, and Base class for ORM models."""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

# The engine is the actual connection to PostgreSQL.
# pool_pre_ping=True tests connections before use (handles restarts gracefully).
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

# SessionLocal is a factory — each HTTP request gets its own session.
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    """All ORM models (User, Resume, Report, etc.) inherit from this."""
    pass


def get_db():
    """
    FastAPI dependency that yields a DB session per request.
    Use it in routes like:   def my_route(db: Session = Depends(get_db)): ...
    The 'yield' + 'finally' pattern guarantees the session is closed
    even if the request raises an exception.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()