# =============================================================
# Conference Platform — Database Engine & Session Factories
# backend/app/database.py
#
# Provides BOTH sync (Alembic / legacy) and async (FastAPI)
# SQLAlchemy engines so the rest of the codebase can use either.
# =============================================================

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


from app.config import settings


# ── Declarative base ──────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── Async engine (FastAPI / dependencies.py) ──────────────────
async_engine = create_async_engine(
    settings.async_database_url,
    echo=settings.debug,
    pool_pre_ping=True,         # validate connection before checkout
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,     # keep ORM objects usable after commit
    autoflush=False,
    autocommit=False,
)


# ── Sync engine (Alembic migrations, CLI scripts) ─────────────
engine = create_engine(
    settings.DATABASE_URL_SYNC,
    future=True,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    future=True,
)


# ── Dependency helpers ────────────────────────────────────────

async def get_database_async() -> AsyncSession:  # type: ignore[return]
    """
    Async dependency for FastAPI routes.
    Prefer injecting via `dependencies.DB` type alias instead.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def get_database():
    """Sync dependency kept for Alembic env.py / legacy scripts."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
