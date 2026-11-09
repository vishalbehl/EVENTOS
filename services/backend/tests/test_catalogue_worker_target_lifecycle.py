"""Legacy page execution must fence and recheck its actual customer target."""
import asyncio
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.platform.models.organization import Organization
from app.modules.rbac.models.access_foundation import OrganizationAccessRevision
from app.modules.rbac.services.access_foundation import lock_revision
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation as Evidence
from app.tasks import catalogue_reconciliation as worker
from tests.test_catalogue_retirement_concurrency import race_fixture, wait_for_blocker


@pytest_asyncio.fixture(params=[-1, 1], ids=["target-before-platform", "target-after-platform"])
async def page_target(committed_session_factory, race_fixture, monkeypatch, request):
    data = {**race_fixture, "owner_id": uuid.UUID(int=race_fixture["platform_id"].int + request.param),
        "category_id": uuid.uuid4()}
    selected = ContextVar("legacy_target_connection")

    @asynccontextmanager
    async def sessions():
        yield selected.get()
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    async with committed_session_factory() as db:
        db.add(Organization(id=data["owner_id"], name="Target lifecycle fixture", slug=f"target-{data['owner_id'].hex}"))
        await db.flush()
        db.add_all([OrganizationAccessRevision(organization_id=data["owner_id"]),
            FormCategory(id=data["category_id"], organization_id=data["owner_id"],
                name="Target page", slug=f"page-{data['category_id'].hex}")])
        await db.commit()
    try:
        yield data, selected
    finally:
        async with committed_session_factory() as db:
            await db.execute(delete(Evidence).where(Evidence.organization_id == data["owner_id"]))
            await db.execute(delete(FormCategory).where(FormCategory.id == data["category_id"]))
            await db.execute(delete(OrganizationAccessRevision).where(OrganizationAccessRevision.organization_id == data["owner_id"]))
            await db.execute(delete(Organization).where(Organization.id == data["owner_id"]))
            await db.commit()


async def execute(db, selected, data, target=None):
    token = selected.set(db)
    try:
        return await worker._process_page(target or data["owner_id"], data["actor_id"], "FORM_CATEGORY", None)
    finally:
        selected.reset(token)


async def archive(db, data):
    # The canonical target revision protocol. No home-platform lock is taken:
    # target correctness must not depend on an incidental shared operator home.
    async with TenantContextGuard.scoped(db, data["owner_id"]):
        revision = await lock_revision(db, data["owner_id"], write=True)
        target = await db.get(Organization, data["owner_id"])
        target.archived_at = datetime.now(timezone.utc)
        target.is_active = False
        target.profile_version += 1
        revision.revision += 1
        await db.commit()


@pytest.mark.asyncio
async def test_legacy_page_rejects_already_archived_target(committed_session_factory, page_target):
    data, selected = page_target
    async with committed_session_factory() as db:
        await archive(db, data)
        with pytest.raises(PermissionError, match="target no longer available"):
            await execute(db, selected, data)
        await db.rollback()
        assert await db.scalar(select(func.count()).select_from(Evidence).where(Evidence.organization_id == data["owner_id"])) == 0


@pytest.mark.asyncio
async def test_legacy_tenant_page_cannot_use_platform_as_customer_target(committed_session_factory, page_target):
    data, selected = page_target
    async with committed_session_factory() as db:
        with pytest.raises(PermissionError, match="target no longer available"):
            await execute(db, selected, data, target=data["platform_id"])
        await db.rollback()


@pytest.mark.asyncio
async def test_cached_active_target_does_not_waive_committed_archive(committed_session_factory, page_target):
    data, selected = page_target
    async with committed_session_factory() as reader, committed_session_factory() as archiving:
        cached = await reader.get(Organization, data["owner_id"])
        assert cached.archived_at is None
        await archive(archiving, data)
        with pytest.raises(PermissionError, match="target no longer available"):
            await execute(reader, selected, data)
        await reader.rollback()


@pytest.mark.asyncio
@pytest.mark.parametrize("worker_first", [False, True])
async def test_legacy_page_orders_with_target_archive(committed_session_factory, page_target, worker_first):
    data, selected = page_target
    task = None
    try:
        async with committed_session_factory() as outer, committed_session_factory() as second:
            connection = await outer.connection()
            async with AsyncSession(bind=connection, expire_on_commit=False,
                    join_transaction_mode="create_savepoint") as first:
                if worker_first:
                    assert (await execute(first, selected, data))["checked"] == 1
                    pid = await second.scalar(text("SELECT pg_backend_pid()"))
                    task = asyncio.create_task(archive(second, data))
                else:
                    await archive(first, data)
                    pid = await second.scalar(text("SELECT pg_backend_pid()"))
                    task = asyncio.create_task(execute(second, selected, data))
                await wait_for_blocker(first, pid, task)
                await first.close()
                await outer.commit()
                if worker_first:
                    await asyncio.wait_for(task, 15)
                else:
                    with pytest.raises(PermissionError, match="target no longer available"):
                        await asyncio.wait_for(task, 15)
                    await second.rollback()
        async with committed_session_factory() as observer:
            assert (await observer.get(Organization, data["owner_id"])).archived_at is not None
            assert await observer.scalar(select(func.count()).select_from(Evidence).where(
                Evidence.organization_id == data["owner_id"])) == int(worker_first)
    finally:
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
