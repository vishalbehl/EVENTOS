from __future__ import annotations

import uuid
from urllib.parse import urlparse, urlunparse

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401
from app.config import settings
from app.core.database_security import enforce_runtime_database_security, inspect_database_security
from app.core.tenant_context import TenantContextGuard
from app.core.tenancy_registry import (
    ALL_TENANT_TABLES,
    DERIVED_TENANT_TABLES,
    EVENT_TENANT_TABLES,
    MIXED_TENANT_TABLES,
    TENANT_TABLES,
)
from app.database import Base, tenant_org_id


def test_rls_registry_references_direct_non_nullable_tenant_owners() -> None:
    for tenant_table in TENANT_TABLES:
        table = Base.metadata.tables[tenant_table.fullname]
        ownership_column = table.columns[tenant_table.ownership_column]
        assert ownership_column.nullable is False
        assert any(
            tenant_table.ownership_column in index.columns
            for index in table.indexes
        ) or tenant_table.fullname == "billing.operation_requests"


def test_canary_migration_is_snapshot_frozen_and_not_forced() -> None:
    migration = (
        __import__("pathlib").Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "20260710_0200_phase1_tenant_rls_canary.py"
    ).read_text(encoding="utf-8")
    assert "ENABLE ROW LEVEL SECURITY" in migration
    assert "CREATE POLICY" in migration
    assert "FORCE ROW LEVEL SECURITY" not in migration
    assert "from app.core.tenancy_registry import" not in migration


def test_event_derived_registry_uses_non_nullable_indexed_event_owners() -> None:
    for tenant_table in EVENT_TENANT_TABLES:
        table = Base.metadata.tables[tenant_table.fullname]
        ownership_column = table.columns[tenant_table.ownership_column]
        assert tenant_table.ownership_strategy == "EVENT_ROOT"
        assert ownership_column.nullable is False
        assert any(tenant_table.ownership_column in index.columns for index in table.indexes)


def test_derived_registry_has_explicit_index_root_ownership() -> None:
    for tenant_table in DERIVED_TENANT_TABLES:
        table = Base.metadata.tables[tenant_table.fullname]
        ownership_column = table.columns[tenant_table.ownership_column]
        assert tenant_table.ownership_strategy == "SEARCH_INDEX_ROOT"
        assert ownership_column.nullable is False
        assert any(tenant_table.ownership_column in index.columns for index in table.indexes)


def test_event_derived_migration_is_frozen_and_not_forced() -> None:
    migration = (
        __import__("pathlib").Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "20260710_0300_phase1_event_derived_rls.py"
    ).read_text(encoding="utf-8")
    assert "ENABLE ROW LEVEL SECURITY" in migration
    assert "CREATE POLICY" in migration
    assert "tenant_event.id = event_id" in migration
    assert "FORCE ROW LEVEL SECURITY" not in migration
    assert "from app.core.tenancy_registry import" not in migration


def test_mixed_scope_registry_has_explicit_non_nullable_owner_paths() -> None:
    for tenant_table in MIXED_TENANT_TABLES:
        table = Base.metadata.tables[tenant_table.fullname]
        ownership_column = table.columns[tenant_table.ownership_column]
        assert tenant_table.ownership_strategy in {
            "DIRECT_OPTIONAL_EVENT",
            "DIRECT_REQUIRED_EVENT",
            "USER_OPTIONAL_SCOPE",
        }
        assert ownership_column.nullable is False
        assert any(tenant_table.ownership_column in index.columns for index in table.indexes)


def test_mixed_scope_migration_has_no_null_owner_fallback() -> None:
    migration = (
        __import__("pathlib").Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "20260710_0400_phase1_mixed_scope_rls.py"
    ).read_text(encoding="utf-8")
    assert "ENABLE ROW LEVEL SECURITY" in migration
    assert "CREATE POLICY" in migration
    assert "organization_id = platform.current_organization_id()" in migration
    assert "tenant_user.organization_id = platform.current_organization_id()" in migration
    assert "FORCE ROW LEVEL SECURITY" not in migration
    assert "event_id IS NULL OR event_id" not in migration


@pytest.mark.asyncio
async def test_database_security_report_detects_unsafe_test_role(db) -> None:
    report = await inspect_database_security(db)
    assert report.role_name
    assert not report.runtime_role_is_safe
    assert set(report.missing_canary_policies) == {
        tenant_table.fullname for tenant_table in ALL_TENANT_TABLES
    }
    with pytest.raises(RuntimeError, match="Unsafe runtime database security"):
        await enforce_runtime_database_security(db)


@pytest.mark.asyncio
async def test_verified_tenant_override_restores_transaction_context(db) -> None:
    org_a = uuid.uuid4()
    org_b = uuid.uuid4()
    token = tenant_org_id.set(org_a)
    try:
        await TenantContextGuard.apply(db, org_a)
        async with TenantContextGuard.scoped(db, org_b):
            assert TenantContextGuard.current() == org_b
            assert await db.scalar(
                text("SELECT current_setting('app.current_organization_id', true)")
            ) == str(org_b)
        assert TenantContextGuard.current() == org_a
        assert await db.scalar(
            text("SELECT current_setting('app.current_organization_id', true)")
        ) == str(org_a)
    finally:
        tenant_org_id.reset(token)
        await TenantContextGuard.apply(db, None)


def test_super_admin_has_no_implicit_tenant_context_bypass() -> None:
    middleware = (
        __import__("pathlib").Path(__file__).parents[1]
        / "app"
        / "middleware"
        / "tenant_context.py"
    ).read_text(encoding="utf-8")
    assert 'role == "super_admin"' not in middleware


@pytest.mark.asyncio
async def test_transaction_local_tenant_context_does_not_leak_on_connection_reuse() -> None:
    parsed = urlparse(settings.async_database_url)
    db_name = parsed.path.lstrip("/")
    if not db_name.endswith("_test"):
        db_name = f"{db_name}_test" if db_name else "eventos_db_test"
    test_url = urlunparse(parsed._replace(path=f"/{db_name}"))
    engine = create_async_engine(test_url, pool_size=1, max_overflow=0, pool_pre_ping=True)
    org_a = uuid.uuid4()
    org_b = uuid.uuid4()

    try:
        async with engine.begin() as connection:
            backend_pid_a = await connection.scalar(text("SELECT pg_backend_pid()"))
            await connection.execute(
                text("SELECT set_config('app.current_organization_id', :org_id, true)"),
                {"org_id": str(org_a)},
            )
            assert await connection.scalar(
                text("SELECT current_setting('app.current_organization_id', true)")
            ) == str(org_a)

        async with engine.begin() as connection:
            backend_pid_b = await connection.scalar(text("SELECT pg_backend_pid()"))
            assert backend_pid_b == backend_pid_a
            inherited = await connection.scalar(
                text("SELECT current_setting('app.current_organization_id', true)")
            )
            assert inherited in (None, "")
            await connection.execute(
                text("SELECT set_config('app.current_organization_id', :org_id, true)"),
                {"org_id": str(org_b)},
            )
            assert await connection.scalar(
                text("SELECT current_setting('app.current_organization_id', true)")
            ) == str(org_b)
    finally:
        await engine.dispose()
