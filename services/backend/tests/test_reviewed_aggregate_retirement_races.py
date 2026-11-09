"""Independent committed repair/retirement transactions, not a mocked mutex.

The isolated operator-owned test DB proves ordering; migrated runtime-role and
HTTP/browser acceptance remain separate evidence.
"""
import asyncio

from fastapi import HTTPException
import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.abstracts.models import AbstractForm
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.identity.models.user import User
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
from app.modules.registration.application.catalogue_lifecycle_locks import lock_template_retirement, lock_category_retirement
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest
from app.tasks.catalogue_reconciliation import _process_page_with_session
from tests.test_catalogue_retirement_concurrency import race_fixture, retire, wait_for_blocker
from tests.test_event_writer_retirement_races import customer_race, assert_current_references


async def prepare_blocked(factory, data):
    resource_type = "REGISTRATION_FORM" if data["writer_kind"] == "registration" else "ABSTRACT_FORM"
    async with factory() as db:
        async with TenantContextGuard.scoped(db, data["owner_id"]):
            model = RegistrationFormConfig if resource_type == "REGISTRATION_FORM" else AbstractForm
            row = await db.scalar(select(model).where(model.event_id == data["event_id"]))
            data["resource_id"], data["resource_type"] = row.id, resource_type
            if resource_type == "REGISTRATION_FORM":
                row.settings = {"custom_js": "Historical unsafe field requires explicit review"}
            else:
                row.schema = {**row.schema, "settings": {"custom_js": "Requires explicit review"}}
            await db.commit()
            result = await _process_page_with_session(db, data["owner_id"], data["actor_id"], resource_type, None)
            assert result["blocked"] == 1


async def reviewed_write(db, data):
    async with TenantContextGuard.scoped(db, data["platform_id"]):
        actor = await db.get(User, data["actor_id"])
        document = {"fields": [], "settings": {}}
        if data["resource_type"] == "ABSTRACT_FORM":
            document["template_id"] = str(data["source_template"])
        return await repair_aggregate_document(db, resource_type=data["resource_type"],
            resource_id=data["resource_id"], actor=actor, if_match='"1"',
            idempotency_key=data["retry_key"], payload=AggregateRepairRequest(
                document=document, reason="Reviewed historical repair during lifecycle ordering acceptance"))


async def assert_persisted_outcome(db, data, kind, succeeded):
    await assert_current_references(db, data, kind, writer_succeeded=succeeded)
    receipt = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == data["retry_key"]))
    assert (receipt is not None) == succeeded
    if receipt is not None:
        assert receipt.organization_id == data["platform_id"] and receipt.actor_id == data["actor_id"]
        audits = list((await db.scalars(select(AuditLog).where(AuditLog.correlation_id == receipt.id))).all())
        assert len(audits) == 1
        audit = audits[0]
        assert audit.organization_id == data["owner_id"] and audit.actor_user_id == data["actor_id"]
        assert audit.action_type == "CATALOGUE_AGGREGATE_EXPLICIT_REPAIR"
        assert audit.row_hash == compute_audit_hash(audit)
    model = RegistrationFormConfig if data["resource_type"] == "REGISTRATION_FORM" else AbstractForm
    row = await db.get(model, data["resource_id"], populate_existing=True)
    settings = row.settings if data["resource_type"] == "REGISTRATION_FORM" else row.schema["settings"]
    assert ("custom_js" not in settings) == succeeded


@pytest.mark.asyncio
@pytest.mark.parametrize("customer_race", ["registration", "abstract"], indirect=True)
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_retirement_before_reviewed_repair(committed_session_factory, customer_race, kind):
    data, task = customer_race, None
    await prepare_blocked(committed_session_factory, data)
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as writing:
            async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                actor = await retiring.get(User, data["actor_id"])
                await (lock_template_retirement(retiring) if kind == "template" else lock_category_retirement(retiring))
                pid = await writing.scalar(text("SELECT pg_backend_pid()"))

                async def repair():
                    try:
                        await reviewed_write(writing, data)
                        return 200
                    except HTTPException as error:
                        return error.status_code

                task = asyncio.create_task(repair())
                await wait_for_blocker(retiring, pid, task)
                assert (await retire(retiring, actor, data, kind))["status"] == "RETIRED"
                status = await asyncio.wait_for(task, 15)
                assert status == (200 if kind == "category" and data["writer_kind"] == "abstract" else
                    409 if kind == "template" and data["writer_kind"] == "abstract" else 412)
        async with committed_session_factory() as observer:
            await assert_persisted_outcome(observer, data, kind, status == 200)
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("customer_race", ["registration", "abstract"], indirect=True)
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_reviewed_repair_before_retirement(committed_session_factory, customer_race, kind):
    data, task = customer_race, None
    await prepare_blocked(committed_session_factory, data)
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as outer:
            connection = await outer.connection()
            async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as writing:
                result = await reviewed_write(writing, data)
                assert result["status"] == "REPAIRED"
                assert await reviewed_write(writing, data) == result
                pid = await retiring.scalar(text("SELECT pg_backend_pid()"))

                async def retirement():
                    async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                        actor = await retiring.get(User, data["actor_id"])
                        return await retire(retiring, actor, data, kind)

                task = asyncio.create_task(retirement())
                await wait_for_blocker(writing, pid, task)
                await writing.close()
                await outer.commit()
                assert (await asyncio.wait_for(task, 15))["status"] == "RETIRED"
        async with committed_session_factory() as observer:
            await assert_persisted_outcome(observer, data, kind, True)
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
