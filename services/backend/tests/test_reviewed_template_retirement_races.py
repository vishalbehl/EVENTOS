"""Reviewed GLOBAL document repair cannot race retirement back into activity."""
import asyncio
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.identity.models.user import User
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.registration.application.catalogue_lifecycle_locks import lock_template_retirement, lock_category_retirement
from app.modules.registration.application.template_commands import repair_catalogue_document, retire_global_template
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.schemas.catalogue_contracts import CatalogueRepairRequest
from tests.test_catalogue_retirement_concurrency import race_fixture, retire, wait_for_blocker


async def prepare(factory, data):
    async with factory() as db:
        source = await db.get(FormTemplate, data["source_template"])
        source.settings = {"custom_js": "Historical unsafe document requires explicit review"}
        db.add(FormTemplateReconciliation(template_id=source.id, template_version=1,
            operation="DOCUMENT_VALIDATION", status="BLOCKED"))
        await db.commit()
    data["repair_key"] = f"reviewed-template-race-{uuid.uuid4()}"


async def repair(db, actor, data):
    return await repair_catalogue_document(db, actor=actor, template_id=data["source_template"],
        if_match='"1"', idempotency_key=data["repair_key"], payload=CatalogueRepairRequest(
            document={"fields": [], "settings": {}}, reason="Reviewed independent transaction historical document correction"))


async def observe(factory, data, kind, repaired):
    async with factory() as db:
        source = await db.get(FormTemplate, data["source_template"])
        assert source.is_active == (kind == "category")
        assert source.version == 2 + int(repaired)
        assert ("custom_js" not in source.settings) == repaired
        if kind == "category":
            assert source.category_id == data["replacement_category"]
            parent = await db.get(FormCategory, source.category_id)
            assert parent.is_active and parent.deleted_at is None
        receipt = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == data["repair_key"]))
        assert (receipt is not None) == repaired
        if receipt:
            audits = list((await db.scalars(select(AuditLog).where(AuditLog.correlation_id == receipt.id,
                AuditLog.action_type == "FORM_TEMPLATE_EXPLICIT_REPAIR"))).all())
            assert len(audits) == 1
            assert audits[0].actor_user_id == data["actor_id"]
            assert audits[0].row_hash == compute_audit_hash(audits[0])
        original = await db.scalar(select(FormTemplateReconciliation.id).where(
            FormTemplateReconciliation.template_id == source.id, FormTemplateReconciliation.template_version == 1,
            FormTemplateReconciliation.operation == "DOCUMENT_VALIDATION", FormTemplateReconciliation.status == "BLOCKED"))
        assert original is not None
        if not repaired and kind == "category":
            assert await db.scalar(select(FormTemplateReconciliation.id).where(
                FormTemplateReconciliation.template_id == source.id, FormTemplateReconciliation.template_version == source.version,
                FormTemplateReconciliation.operation == "DOCUMENT_VALIDATION", FormTemplateReconciliation.status == "BLOCKED")) is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_retirement_precedes_reviewed_global_template_repair(committed_session_factory, race_fixture, kind):
    data, task = race_fixture, None
    await prepare(committed_session_factory, data)
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as writing:
            async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                actor = await retiring.get(User, data["actor_id"])
                await (lock_template_retirement(retiring) if kind == "template" else lock_category_retirement(retiring))
                pid = await writing.scalar(text("SELECT pg_backend_pid()"))
                async def writer():
                    async with TenantContextGuard.scoped(writing, data["platform_id"]):
                        reviewer = await writing.get(User, data["actor_id"])
                        with pytest.raises(HTTPException) as denied:
                            await repair(writing, reviewer, data)
                        assert denied.value.status_code == 412
                task = asyncio.create_task(writer())
                await wait_for_blocker(retiring, pid, task)
                assert (await retire(retiring, actor, data, kind))["status"] == "RETIRED"
                await asyncio.wait_for(task, 15)
        await observe(committed_session_factory, data, kind, False)
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_reviewed_global_template_repair_precedes_retirement(committed_session_factory, race_fixture, kind):
    data, task = race_fixture, None
    await prepare(committed_session_factory, data)
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as outer:
            connection = await outer.connection()
            async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as writing:
                async with TenantContextGuard.scoped(writing, data["platform_id"]):
                    actor = await writing.get(User, data["actor_id"])
                    result = await repair(writing, actor, data)
                    assert result["version"] == 2 and await repair(writing, actor, data) == result
                pid = await retiring.scalar(text("SELECT pg_backend_pid()"))
                async def retirement():
                    async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                        actor = await retiring.get(User, data["actor_id"])
                        if kind == "category":
                            return await retire(retiring, actor, data, kind)
                        return await retire_global_template(retiring, actor=actor,
                            template_id=data["source_template"], replacement_template_id=data["replacement_template"],
                            if_match=str(result["version"]), idempotency_key=f"reviewed-race-retire-{uuid.uuid4()}",
                            reason="Reviewed source version retirement ordering")
                task = asyncio.create_task(retirement())
                await wait_for_blocker(writing, pid, task)
                await writing.close()
                await outer.commit()
                assert (await asyncio.wait_for(task, 15))["status"] == "RETIRED"
        await observe(committed_session_factory, data, kind, True)
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
