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

import uuid

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from workers.config import settings
from app.database import tenant_org_id

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


@event.listens_for(Session, "after_begin")
def _apply_worker_tenant_context(session, transaction, connection) -> None:
    if connection.dialect.name != "postgresql":
        return
    organization_id = session.info.get("organization_id")
    value = str(organization_id) if isinstance(organization_id, uuid.UUID) else ""
    connection.execute(
        text("SELECT set_config('app.current_organization_id', :org_id, true)"),
        {"org_id": value},
    )


@contextmanager
def get_db_session(
    organization_id: uuid.UUID | None = None,
) -> Generator[Session, None, None]:
    """
    Context manager that provides a sync DB session.

    Usage:
        with get_db_session() as db:
            db.query(...)

    Rolls back automatically on exception. Always closes on exit.
    """
    if organization_id is not None and not isinstance(organization_id, uuid.UUID):
        raise ValueError("Worker tenant context must be a UUID.")
    session: Session = _SessionLocal()
    context_token = None
    if organization_id is not None:
        session.info["organization_id"] = organization_id
        context_token = tenant_org_id.set(organization_id)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
        if context_token is not None:
            tenant_org_id.reset(context_token)
