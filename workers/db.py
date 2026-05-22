# =============================================================
# Conference Platform — Shared Database Session (Workers)
# workers/db.py
#
# Synchronous SQLAlchemy session factory for Celery tasks.
# Workers use sync I/O (psycopg2) because Celery's task
# execution model is synchronous.
# =============================================================

from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from workers.config import settings

_engine = create_engine(
    settings.DATABASE_URL_SYNC,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,  # reconnect on stale connections
    echo=False,
)

_SessionLocal = sessionmaker(
    bind=_engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """
    Context manager that provides a sync DB session.

    Usage:
        with get_db_session() as db:
            db.query(...)

    Rolls back automatically on exception. Always closes on exit.
    """
    session: Session = _SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
