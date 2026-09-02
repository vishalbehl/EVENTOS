# venue-server/app/database.py
import asyncio
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings, reload_settings

class Base(DeclarativeBase):
    pass

DEFAULT_FALLBACK_URL = "postgresql+asyncpg://postgres:847425@127.0.0.1:5432/eventos_venue_server"

def get_effective_db_url(url: Optional[str] = None) -> str:
    candidate = (url or settings.DATABASE_URL or "").strip()
    if not candidate:
        return DEFAULT_FALLBACK_URL
    return candidate

async_engine = create_async_engine(
    get_effective_db_url(),
    echo=False,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

async def reload_database_engine(new_url: Optional[str] = None) -> str:
    """Dynamically dispose existing engine and reconnect to the latest DATABASE_URL."""
    global async_engine, AsyncSessionLocal
    current_settings = reload_settings()
    target_url = get_effective_db_url(new_url or current_settings.DATABASE_URL)

    old_engine = async_engine
    try:
        await old_engine.dispose()
    except Exception:
        pass

    async_engine = create_async_engine(
        target_url,
        echo=False,
        pool_pre_ping=True,
    )
    AsyncSessionLocal.configure(bind=async_engine)
    return target_url

async def get_database() -> AsyncSession:  # type: ignore
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
