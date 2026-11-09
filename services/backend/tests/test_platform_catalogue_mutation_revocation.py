"""Real catalogue commands must retain authority until their commit boundary."""
import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.idempotency import IdempotencyRecord
from tests.test_catalogue_retirement_concurrency import (
    race_fixture, retire, write, wait_for_blocker, prepare_taxonomy_repair, repair_taxonomy,
)
from tests.test_duplicate_cli_authority_ordering import revoke


async def mutate(db, data, operation):
    async with TenantContextGuard.scoped(db, data["platform_id"]):
        actor = await db.get(User, data["actor_id"])
        if operation == "create":
            return await write(db, actor, data, "category")
        if operation == "repair":
            return await repair_taxonomy(db, actor, data, data["category_key"])
        return await retire(db, actor, data, operation)


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["create", "template", "category", "repair"])
@pytest.mark.parametrize("writer_first", [False, True])
async def test_platform_catalogue_command_revocation_ordering(
        committed_session_factory, race_fixture, operation, writer_first):
    data, task = race_fixture, None
    if operation == "repair":
        await prepare_taxonomy_repair(committed_session_factory, data)
    try:
        async with committed_session_factory() as outer, committed_session_factory() as second:
            connection = await outer.connection()
            async with AsyncSession(bind=connection, expire_on_commit=False,
                    join_transaction_mode="create_savepoint") as first:
                if writer_first:
                    await mutate(first, data, operation)
                    pid = await second.scalar(text("SELECT pg_backend_pid()"))
                    task = asyncio.create_task(revoke(second, data))
                else:
                    await revoke(first, data)
                    # Release the savepoint into the still-open outer transaction;
                    # closing an uncommitted savepoint would undo the revocation.
                    await first.commit()
                    pid = await second.scalar(text("SELECT pg_backend_pid()"))
                    task = asyncio.create_task(mutate(second, data, operation))
                await wait_for_blocker(first, pid, task)
                await first.close()
                await outer.commit()
                if writer_first:
                    await asyncio.wait_for(task, 15)
                    await second.commit()
                else:
                    with pytest.raises(HTTPException) as denied:
                        await asyncio.wait_for(task, 15)
                    assert denied.value.status_code == 403
                    await second.rollback()
        async with committed_session_factory() as observer:
            # A loaded ORM actor can still have an old global super-admin label;
            # authority is the committed canonical platform role, never that label.
            with pytest.raises(HTTPException) as denied:
                await mutate(observer, data, operation)
            assert denied.value.status_code == 403
            await observer.rollback()
            receipts = await observer.scalar(select(func.count()).select_from(IdempotencyRecord).where(
                IdempotencyRecord.organization_id == data["platform_id"]))
            audits = await observer.scalar(select(func.count()).select_from(AuditLog).where(
                AuditLog.organization_id == data["platform_id"]))
            assert receipts == int(writer_first) and audits == int(writer_first)
    finally:
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
