"""Reconciliation must inspect the target even with inherited broker context."""
from contextlib import asynccontextmanager
import uuid

import pytest
from sqlalchemy import select

from app.database import tenant_org_id
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation


@pytest.mark.asyncio
async def test_reconciliation_pages_over_one_hundred_without_loss_or_duplicate_evidence(
    db, organization, super_admin, monkeypatch,
):
    from app.tasks import catalogue_reconciliation as worker
    categories = [FormCategory(organization_id=organization.id, name=f"Category {index}",
        slug=f"page-{uuid.uuid4().hex}") for index in range(205)]
    db.add_all(categories)
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    cursor = None
    counts = []
    while True:
        result = await worker._process_page(organization.id, super_admin.id,
            "FORM_CATEGORY", cursor)
        counts.append(result["checked"])
        assert result["blocked"] == 0
        if not result["next_cursor"]:
            break
        next_cursor = uuid.UUID(result["next_cursor"])
        assert cursor is None or next_cursor > cursor
        cursor = next_cursor
    assert counts == [100, 100, 5]
    await worker._process_page(organization.id, super_admin.id, "FORM_CATEGORY", None)
    from app.core.tenant_context import TenantContextGuard
    async with TenantContextGuard.scoped(db, organization.id):
        evidence = list((await db.scalars(select(CatalogueDocumentReconciliation).where(
            CatalogueDocumentReconciliation.resource_id.in_([row.id for row in categories])))).all())
        assert len(evidence) == 205


@pytest.mark.asyncio
async def test_committed_dispatch_recovers_after_lease_and_preserves_context(
    db, organization, super_admin, monkeypatch,
):
    from datetime import datetime, timedelta, timezone
    from app.tasks import catalogue_reconciliation as worker
    from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun
    from app.core.tenant_context import TenantContextGuard
    row = CatalogueReconciliationRun(organization_id=super_admin.organization_id,
        actor_user_id=super_admin.id, reason="Isolated dispatch recovery acceptance",
        next_dispatch_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    db.add(row)
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    token = tenant_org_id.set(organization.id)
    try:
        first = await worker._claim_reconciliation_runs()
        assert first == [(row.id, super_admin.id, 1)]
        assert tenant_org_id.get() == organization.id
        assert await worker._claim_reconciliation_runs() == []
        async with TenantContextGuard.scoped(db, super_admin.organization_id):
            row.next_dispatch_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            await db.commit()
        # No successful publish occurred. The committed attempt becomes claimable.
        assert await worker._claim_reconciliation_runs() == [(row.id, super_admin.id, 2)]
        assert await worker._mark_run_started(row.id, super_admin.id, 2)
        await worker._mark_run_dispatched(row.id, super_admin.id, 2)
        assert not await worker._mark_run_started(row.id, super_admin.id)
        assert tenant_org_id.get() == organization.id
    finally:
        tenant_org_id.reset(token)


@pytest.mark.asyncio
@pytest.mark.parametrize("inherited", ["platform", "customer"])
async def test_reconciliation_uses_target_and_restores_inherited_context(
    db, organization, super_admin, monkeypatch, inherited,
):
    from app.tasks import catalogue_reconciliation as worker
    category = FormCategory(organization_id=organization.id, name="Rehearsal category",
        slug=f"rehearsal-{uuid.uuid4().hex}")
    db.add(category)
    await db.commit()
    category_id, organization_id, actor_id = category.id, organization.id, super_admin.id
    prior = super_admin.organization_id if inherited == "platform" else organization_id

    @asynccontextmanager
    async def sessions():
        # Inject the real PostgreSQL test session, not a repository/SQL double.
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    token = tenant_org_id.set(prior)
    try:
        result = await worker._process_page(organization_id, actor_id, "FORM_CATEGORY", None)
        assert result["checked"] == 1
        assert result["blocked"] == 0
        assert tenant_org_id.get() == prior
        from app.core.tenant_context import TenantContextGuard
        async with TenantContextGuard.scoped(db, organization_id):
            evidence = await db.scalar(select(CatalogueDocumentReconciliation).where(
                CatalogueDocumentReconciliation.resource_id == category_id))
            assert evidence is not None and evidence.status == "VALID"
        with pytest.raises(ValueError, match="Unsupported reconciliation stage"):
            await worker._process_page(organization_id, actor_id, "INVALID", None)
        assert tenant_org_id.get() == prior
    finally:
        tenant_org_id.reset(token)


@pytest.mark.asyncio
async def test_global_taxonomy_duplicate_count_includes_global_rows(db, super_admin, monkeypatch):
    from app.tasks import catalogue_reconciliation as worker
    category = FormCategory(name="Global review category", slug=f"global-{uuid.uuid4().hex}")
    db.add(category)
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    token = tenant_org_id.set(super_admin.organization_id)
    try:
        result = await worker._global_category_page(super_admin.id, None)
        assert result["checked"] == 1
        assert result["blocked"] == 0
        evidence = await db.scalar(select(FormCategoryReconciliation).where(
            FormCategoryReconciliation.category_id == category.id))
        assert evidence.status == "VALID"
    finally:
        tenant_org_id.reset(token)


@pytest.mark.asyncio
async def test_started_fanout_crash_is_reclaimable_after_its_lease(db, super_admin, monkeypatch):
    from datetime import datetime, timedelta, timezone
    from app.tasks import catalogue_reconciliation as worker
    from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun
    row = CatalogueReconciliationRun(organization_id=super_admin.organization_id,
        actor_user_id=super_admin.id, reason="Crash after durable fanout start",
        status="RUNNING", dispatch_attempts=1, started_at=datetime.now(timezone.utc) - timedelta(hours=1),
        next_dispatch_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    db.add(row)
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    messages = await worker._claim_reconciliation_runs()
    assert messages == [(row.id, super_admin.id, 2)]
    await db.refresh(row)
    assert row.status == "PENDING"


@pytest.mark.asyncio
async def test_started_fanout_holds_a_lease_covering_its_hard_timeout(db, super_admin, monkeypatch):
    from datetime import datetime, timedelta, timezone
    from app.tasks import catalogue_reconciliation as worker
    from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun
    row = CatalogueReconciliationRun(organization_id=super_admin.organization_id,
        actor_user_id=super_admin.id, reason="Live worker lease must not expire early",
        status="PENDING", dispatch_attempts=1,
        next_dispatch_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    db.add(row)
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    before = datetime.now(timezone.utc)
    assert await worker._mark_run_started(row.id, super_admin.id)
    await db.refresh(row)
    assert row.next_dispatch_at >= before + timedelta(seconds=worker._POLICY.hard_timeout_seconds)
    assert await worker._claim_reconciliation_runs() == []
