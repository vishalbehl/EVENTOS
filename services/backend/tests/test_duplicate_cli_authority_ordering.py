"""Historical maintenance authority must order against canonical revocation."""
import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, text

from app.core.tenant_context import TenantContextGuard
from app.modules.identity.models.user import User
from app.modules.rbac.services.access_foundation import lock_revision
from app.modules.rbac.models.access_foundation import OrganizationAccessRevision
from app.modules.registration.application.category_commands import category_authority
from scripts.reconcile_catalogue_duplicates import _authorise_actor
from tests.test_catalogue_retirement_concurrency import race_fixture, wait_for_blocker


async def authorise(db, actor_id, path="historical"):
    if path == "platform":
        actor = await db.get(User, actor_id)
        return await category_authority(db, actor, "PLATFORM")
    if path == "worker":
        from app.tasks.catalogue_reconciliation import _authorise_platform_actor
        return await _authorise_platform_actor(db, actor_id, for_write=True)
    return await db.run_sync(lambda session: _authorise_actor(session.connection(), actor_id))


async def revoke(db, data):
    async with TenantContextGuard.scoped(db, data["platform_id"]):
        revision = await lock_revision(db, data["platform_id"], write=True)
        actor = await db.get(User, data["actor_id"])
        actor.platform_role = None
        revision.revision += 1
        await db.flush()


@pytest.mark.asyncio
@pytest.mark.parametrize("maintenance_first", [False, True])
@pytest.mark.parametrize("path", ["historical", "platform", "worker"])
async def test_duplicate_maintenance_authority_orders_with_revocation(
        committed_session_factory, race_fixture, maintenance_first, path):
    data, task = race_fixture, None
    try:
        async with committed_session_factory() as first, committed_session_factory() as second:
            if maintenance_first:
                await authorise(first, data["actor_id"], path)
                pid = await second.scalar(text("SELECT pg_backend_pid()"))
                task = asyncio.create_task(revoke(second, data))
            else:
                await revoke(first, data)
                pid = await second.scalar(text("SELECT pg_backend_pid()"))
                task = asyncio.create_task(authorise(second, data["actor_id"], path))
            await wait_for_blocker(first, pid, task)
            await first.commit()
            if maintenance_first:
                await asyncio.wait_for(task, 15)
                await second.commit()
            else:
                with pytest.raises(RuntimeError if path == "historical" else HTTPException) as denied:
                    await asyncio.wait_for(task, 15)
                if path == "historical":
                    assert isinstance(denied.value, RuntimeError)
                else:
                    assert getattr(denied.value, "status_code", None) == 403
                await second.rollback()
        async with committed_session_factory() as observer:
            with pytest.raises(RuntimeError if path == "historical" else HTTPException) as denied:
                await authorise(observer, data["actor_id"], path)
            if path == "historical":
                assert isinstance(denied.value, RuntimeError)
            else:
                assert getattr(denied.value, "status_code", None) == 403
    finally:
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
async def test_duplicate_maintenance_missing_revision_fails_without_implicit_repair(
        committed_session_factory, race_fixture):
    data = race_fixture
    async with committed_session_factory() as db:
        await db.execute(delete(OrganizationAccessRevision).where(
            OrganizationAccessRevision.organization_id == data["platform_id"]))
        await db.commit()
        with pytest.raises(RuntimeError, match="access revision requires reconciliation"):
            await authorise(db, data["actor_id"])
        assert await db.get(OrganizationAccessRevision, data["platform_id"]) is None
