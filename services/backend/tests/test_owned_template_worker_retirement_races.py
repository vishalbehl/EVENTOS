"""Real tenant template pages preserve live copies across global retirement."""
import asyncio
from contextlib import asynccontextmanager
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.identity.models.user import User
from app.modules.registration.application.catalogue_lifecycle_locks import (
    lock_template_retirement, lock_category_retirement,
)
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.models.form_category import FormCategory
from app.tasks import catalogue_reconciliation as worker
from tests.test_catalogue_retirement_concurrency import race_fixture, retire, wait_for_blocker
from tests.test_event_writer_retirement_races import customer_race, customer_write


async def prepare(factory, data, scope):
    async with factory() as db:
        if scope == "EVENT":
            await customer_write(db, data)
            row = await db.scalar(select(FormTemplate).where(FormTemplate.organization_id == data["owner_id"],
                FormTemplate.scope_type == "EVENT"))
        else:
            row = FormTemplate(organization_id=data["owner_id"], created_by=data["customer_actor_id"],
                name="Owned normalization fixture", slug=f"owned-normalize-{uuid.uuid4().hex}",
                scope_type="ORGANIZATION", category_id=data["source_category"], category_key="survey",
                fields=[], settings={})
            db.add(row)
        row.fields = [{"id": "legacy", "name": "legacy", "label": "Legacy", "type": "text"}]
        await db.commit()
        data["owned_template_id"] = row.id
        data["original_settings"] = dict(row.settings)


async def process(db, data, monkeypatch):
    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    return await worker._process_page(data["owner_id"], data["actor_id"], "FORM_TEMPLATE", None)


async def observe(factory, data, kind, scope, monkeypatch):
    async with factory() as db:
        row = await db.get(FormTemplate, data["owned_template_id"])
        assert row.organization_id == data["owner_id"] and row.scope_type == scope and row.is_active
        assert row.version == (3 if kind == "category" else 2)
        assert row.fields[0]["id"] == "legacy" and row.fields[0]["is_active"] is True
        assert row.settings == data["original_settings"]
        if scope == "EVENT":
            assert row.settings["_event_id"] == str(data["event_id"])
            assert row.settings["_source_template_id"] == str(data["source_template"])
        assert row.category_id == data["replacement_category" if kind == "category" else "source_category"]
        category = await db.get(FormCategory, row.category_id)
        assert category.is_active and category.deleted_at is None
        source = await db.get(FormTemplate, data["source_template"])
        assert source.is_active == (kind == "category")
        ids = set((await db.scalars(select(FormTemplate.id))).all())
        result = await process(db, data, monkeypatch)
        assert result == {"checked": 1, "normalized": 0, "blocked": 0, "next_cursor": None}
        assert set((await db.scalars(select(FormTemplate.id))).all()) == ids
        evidence = await db.scalar(select(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id == row.id,
            FormTemplateReconciliation.template_version == row.version,
            FormTemplateReconciliation.operation == "DOCUMENT_VALIDATION"))
        assert evidence.status == "VALID"


@pytest.mark.asyncio
@pytest.mark.parametrize("customer_race", ["copy"], indirect=True)
@pytest.mark.parametrize("scope", ["ORGANIZATION", "EVENT"])
@pytest.mark.parametrize("kind", ["template", "category"])
@pytest.mark.parametrize("worker_first", [False, True])
async def test_owned_template_worker_retirement(
        committed_session_factory, customer_race, monkeypatch, scope, kind, worker_first):
    data, task = {**customer_race}, None
    await prepare(committed_session_factory, data, scope)
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as outer:
            if not worker_first:
                async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                    actor = await retiring.get(User, data["actor_id"])
                    await (lock_template_retirement(retiring) if kind == "template" else lock_category_retirement(retiring))
                    pid = await outer.scalar(text("SELECT pg_backend_pid()"))
                    task = asyncio.create_task(process(outer, data, monkeypatch))
                    await wait_for_blocker(retiring, pid, task)
                    assert (await retire(retiring, actor, data, kind))["status"] == "RETIRED"
                    result = await asyncio.wait_for(task, 15)
                    assert result["normalized"] == 1 and result["blocked"] == 0
            else:
                connection = await outer.connection()
                async with AsyncSession(bind=connection, expire_on_commit=False,
                        join_transaction_mode="create_savepoint") as normalizing:
                    result = await process(normalizing, data, monkeypatch)
                    assert result["normalized"] == 1 and result["blocked"] == 0
                    pid = await retiring.scalar(text("SELECT pg_backend_pid()"))

                    async def retirement():
                        async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                            actor = await retiring.get(User, data["actor_id"])
                            return await retire(retiring, actor, data, kind)

                    task = asyncio.create_task(retirement())
                    await wait_for_blocker(normalizing, pid, task)
                    await normalizing.close()
                    await outer.commit()
                    assert (await asyncio.wait_for(task, 15))["status"] == "RETIRED"
        await observe(committed_session_factory, data, kind, scope, monkeypatch)
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
