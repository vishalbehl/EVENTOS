"""Receipt-bearing manual reconciliation pages use the retirement fence too."""
import asyncio
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.identity.models.user import User
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.registration.application.catalogue_lifecycle_locks import lock_template_retirement, lock_category_retirement
from app.modules.registration.application.template_commands import reconcile_catalogue_documents, retire_global_template
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.models.form_category import FormCategory
from tests.test_catalogue_retirement_concurrency import race_fixture, retire, wait_for_blocker
from tests.test_catalogue_worker_retirement_races import prepare


async def page(db, data):
    async with TenantContextGuard.scoped(db, data["platform_id"]):
        actor = await db.get(User, data["actor_id"])
        return await reconcile_catalogue_documents(db, actor=actor, page_size=50,
            idempotency_key=data["page_key"])


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["template", "category"])
@pytest.mark.parametrize("page_first", [False, True])
async def test_manual_catalogue_page_retirement(committed_session_factory, race_fixture, kind, page_first):
    data, task = {**race_fixture, "page_key": f"manual-page-{uuid.uuid4()}"}, None
    await prepare(committed_session_factory, data)
    async with committed_session_factory() as census:
        async with TenantContextGuard.scoped(census, data["platform_id"]):
            eligible = set((await census.scalars(select(FormTemplate.id).where(
                FormTemplate.deleted_at.is_(None), FormTemplate.scope_type.in_(("GLOBAL", "ORGANIZATION")))
                .execution_options(shared_form_catalogue=True))).all())
            assert {data["source_template"], data["replacement_template"]} <= eligible
            assert len(eligible) <= 50
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as outer:
            if not page_first:
                async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                    actor = await retiring.get(User, data["actor_id"])
                    await (lock_template_retirement(retiring) if kind == "template" else lock_category_retirement(retiring))
                    pid = await outer.scalar(text("SELECT pg_backend_pid()"))
                    task = asyncio.create_task(page(outer, data))
                    await wait_for_blocker(retiring, pid, task)
                    assert (await retire(retiring, actor, data, kind))["status"] == "RETIRED"
                    result = await asyncio.wait_for(task, 15)
            else:
                connection = await outer.connection()
                async with AsyncSession(bind=connection, expire_on_commit=False,
                        join_transaction_mode="create_savepoint") as normalizing:
                    result = await page(normalizing, data)
                    pid = await retiring.scalar(text("SELECT pg_backend_pid()"))

                    async def retirement():
                        async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                            actor = await retiring.get(User, data["actor_id"])
                            if kind == "category":
                                return await retire(retiring, actor, data, kind)
                            return await retire_global_template(retiring, actor=actor,
                                template_id=data["source_template"], replacement_template_id=data["replacement_template"],
                                if_match='"2"', idempotency_key=f"manual-page-retire-{uuid.uuid4()}",
                                reason="Retire the loaded normalized catalogue version")

                    task = asyncio.create_task(retirement())
                    await wait_for_blocker(normalizing, pid, task)
                    await normalizing.close()
                    await outer.commit()
                    assert (await asyncio.wait_for(task, 15))["status"] == "RETIRED"
        assert result == {"checked": len(eligible), "normalized": 1, "blocked": 0, "next_cursor": None}
        async with committed_session_factory() as db:
            receipt = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == data["page_key"]))
            assert receipt.status == "COMPLETED" and receipt.actor_id == data["actor_id"]
            audits = list((await db.scalars(select(AuditLog).where(AuditLog.correlation_id == receipt.id))).all())
            assert len(audits) == 1 and audits[0].action_type == "FORM_TEMPLATE_RECONCILE_PAGE"
            assert audits[0].row_hash == compute_audit_hash(audits[0])
            # Committed replay must not normalize or audit again.
            assert await page(db, data) == result
            assert len((await db.scalars(select(AuditLog).where(AuditLog.correlation_id == receipt.id))).all()) == 1
            source = await db.get(FormTemplate, data["source_template"], populate_existing=True)
            assert source.version == 3 and source.is_active == (kind == "category")
            assert source.fields[0]["is_active"] is True
            if kind == "category":
                assert source.category_id == data["replacement_category"]
                parent = await db.get(FormCategory, source.category_id)
                assert parent.is_active
            data["page_key"] = f"manual-revalidate-{uuid.uuid4()}"
            again = await page(db, data)
            assert again == {"checked": len(eligible), "normalized": 0, "blocked": 0, "next_cursor": None}
            current = await db.scalar(select(FormTemplateReconciliation).where(
                FormTemplateReconciliation.template_id == source.id,
                FormTemplateReconciliation.template_version == 3,
                FormTemplateReconciliation.operation == "DOCUMENT_VALIDATION"))
            assert current.status == "VALID"
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
