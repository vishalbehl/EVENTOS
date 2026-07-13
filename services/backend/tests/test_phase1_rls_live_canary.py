from __future__ import annotations

import os

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.config import settings
from app.core.database_security import enforce_runtime_database_security
from scripts.verify_rls_canary import verify


@pytest.mark.skipif(
    os.getenv("RUN_RLS_LIVE_CANARY") != "1",
    reason="Requires Alembic policies and a provisioned non-owner eventx_runtime role.",
)
def test_live_non_owner_rls_canary() -> None:
    report = verify()
    assert report["rolled_back"] is True


@pytest.mark.asyncio
@pytest.mark.skipif(
    os.getenv("RUN_RLS_LIVE_CANARY") != "1",
    reason="Requires Alembic policies and a provisioned non-owner eventx_runtime role.",
)
async def test_runtime_role_passes_application_startup_gate() -> None:
    async_url = make_url(settings.DATABASE_URL_SYNC).set(drivername="postgresql+asyncpg")
    engine = create_async_engine(async_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(text('SET LOCAL ROLE "eventx_runtime"'))
            session = AsyncSession(bind=connection, expire_on_commit=False)
            try:
                report = await enforce_runtime_database_security(session)
                assert report.role_name == "eventx_runtime"
                assert report.runtime_role_is_safe
                assert report.missing_canary_policies == ()
            finally:
                await session.close()
    finally:
        await engine.dispose()
