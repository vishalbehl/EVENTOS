"""Global reconciliation is a live reference writer, even outside HTTP."""
import asyncio
from contextlib import asynccontextmanager
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.identity.models.user import User
from app.modules.registration.application.catalogue_lifecycle_locks import lock_template_retirement, lock_category_retirement
from app.modules.registration.application.template_commands import retire_global_template
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.models.form_category import FormCategory
from app.tasks import catalogue_reconciliation as worker
from tests.test_catalogue_retirement_concurrency import race_fixture, retire, wait_for_blocker


async def prepare(factory, data):
    async with factory() as db:
        source = await db.get(FormTemplate, data["source_template"])
        source.fields = [{"id": "legacy", "name": "legacy", "label": "Legacy", "type": "text"}]
        await db.commit()


async def run_page(db, data, monkeypatch):
    @asynccontextmanager
    async def sessions():
        yield db
    # Only the connection supplier is substituted; real worker validation,
    # authorisation, row locks, evidence and transaction code execute unchanged.
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    return await worker._global_template_page(data["actor_id"], None)


async def observe_and_revalidate(factory, data, kind, monkeypatch):
    async with factory() as db:
        source = await db.get(FormTemplate, data["source_template"])
        assert source.version == 3 and source.is_active == (kind == "category")
        assert source.fields[0]["id"] == "legacy" and source.fields[0]["is_active"] is True
        if kind == "category":
            assert source.category_id == data["replacement_category"]
            parent = await db.get(FormCategory, source.category_id)
            assert parent.is_active and parent.deleted_at is None
        ids_before = set((await db.scalars(select(FormTemplate.id))).all())
        # Other committed command cases can retain valid global templates. The
        # real worker processes its entire page, not only this race's two rows.
        # Census exactly that selector independently; never relax checked to >=2.
        eligible = set((await db.scalars(select(FormTemplate.id).where(
            FormTemplate.organization_id.is_(None), FormTemplate.scope_type == "GLOBAL",
            FormTemplate.deleted_at.is_(None)).execution_options(shared_form_catalogue=True))).all())
        assert {data["source_template"], data["replacement_template"]} <= eligible
        assert len(eligible) <= worker._PAGE_SIZE
        # Retirement may create a new maintenance version after validation.
        # Re-run the actual worker to validate that version, never stamp it valid.
        result = await run_page(db, data, monkeypatch)
        assert result["checked"] == len(eligible) and result["blocked"] == 0 and result["normalized"] == 0
        assert set((await db.scalars(select(FormTemplate.id))).all()) == ids_before
        source = await db.get(FormTemplate, data["source_template"], populate_existing=True)
        assert source.version == 3 and source.is_active == (kind == "category")
        current = await db.scalar(select(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id == source.id, FormTemplateReconciliation.template_version == 3,
            FormTemplateReconciliation.operation == "DOCUMENT_VALIDATION"))
        assert current.status == "VALID"


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_retirement_before_global_normalisation_worker(committed_session_factory, race_fixture, monkeypatch, kind):
    data, task = race_fixture, None
    await prepare(committed_session_factory, data)
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as normalizing:
            async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                actor = await retiring.get(User, data["actor_id"])
                await (lock_template_retirement(retiring) if kind == "template" else lock_category_retirement(retiring))
                pid = await normalizing.scalar(text("SELECT pg_backend_pid()"))
                task = asyncio.create_task(run_page(normalizing, data, monkeypatch))
                await wait_for_blocker(retiring, pid, task)
                assert (await retire(retiring, actor, data, kind))["status"] == "RETIRED"
                result = await asyncio.wait_for(task, 15)
                assert result["normalized"] == 1 and result["blocked"] == 0
        await observe_and_revalidate(committed_session_factory, data, kind, monkeypatch)
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_global_normalisation_worker_before_retirement(committed_session_factory, race_fixture, monkeypatch, kind):
    data, task = race_fixture, None
    await prepare(committed_session_factory, data)
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as outer:
            connection = await outer.connection()
            async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as normalizing:
                result = await run_page(normalizing, data, monkeypatch)
                assert result["normalized"] == 1 and result["blocked"] == 0
                pid = await retiring.scalar(text("SELECT pg_backend_pid()"))
                async def retirement():
                    async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                        actor = await retiring.get(User, data["actor_id"])
                        if kind == "category":
                            return await retire(retiring, actor, data, kind)
                        return await retire_global_template(retiring, actor=actor, template_id=data["source_template"],
                            replacement_template_id=data["replacement_template"], if_match='"2"',
                            idempotency_key=f"worker-race-retire-{uuid.uuid4()}", reason="Retire the loaded normalized source version")
                task = asyncio.create_task(retirement())
                await wait_for_blocker(normalizing, pid, task)
                await normalizing.close()
                await outer.commit()
                assert (await asyncio.wait_for(task, 15))["status"] == "RETIRED"
        await observe_and_revalidate(committed_session_factory, data, kind, monkeypatch)
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
