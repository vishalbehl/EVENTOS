"""Owned taxonomy projection never follows corrupt foreign-owner references."""
import asyncio
from contextlib import asynccontextmanager
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.identity.models.user import User
from app.modules.registration.application.catalogue_lifecycle_locks import lock_template_retirement, lock_category_retirement
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.tasks import catalogue_reconciliation as worker
from tests.test_catalogue_retirement_concurrency import race_fixture, retire, wait_for_blocker
from tests.test_event_writer_retirement_races import customer_race, customer_write


@pytest_asyncio.fixture
async def owned_taxonomy(committed_session_factory, customer_race):
    data = {**customer_race}
    async with committed_session_factory() as db:
        await customer_write(db, data)
        owned = await db.scalar(select(FormTemplate).where(FormTemplate.organization_id == data["owner_id"],
            FormTemplate.scope_type == "EVENT"))
        category = FormCategory(organization_id=data["owner_id"], name="Owned taxonomy",
            slug=f"owned-taxonomy-{uuid.uuid4().hex}")
        db.add(category)
        await db.flush()
        owned.category_id, owned.category_key = category.id, "legacy-taxonomy-key"
        foreign = [FormTemplate(organization_id=owner, scope_type="GLOBAL" if owner is None else "ORGANIZATION",
            category_id=category.id, category_key="legacy-taxonomy-key", name="Corrupt foreign reference",
            slug=f"foreign-owned-taxonomy-{uuid.uuid4().hex}", fields=[], settings={})
            for owner in (data["platform_id"], None)]
        db.add_all(foreign)
        await db.flush()
        for row in [owned, *foreign]:
            db.add(FormTemplateReconciliation(template_id=row.id, template_version=1,
                operation="DOCUMENT_VALIDATION", status="BLOCKED"))
        await db.commit()
        data.update(owned_template_id=owned.id, owned_category_id=category.id,
            owned_category_slug=category.slug, foreign_ids=[row.id for row in foreign],
            original_settings=dict(owned.settings))
    try:
        yield data
    finally:
        # Exact generated corrupt-reference fixtures only, in the test database.
        async with committed_session_factory() as db:
            await db.execute(delete(FormTemplateReconciliation).where(
                FormTemplateReconciliation.template_id.in_(data["foreign_ids"])))
            await db.execute(delete(FormTemplate).where(FormTemplate.id.in_(data["foreign_ids"])))
            await db.commit()


async def process(db, data, monkeypatch):
    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    # The public pipeline now validates taxonomy first, then projects only the
    # current template page. Both stages retain their actual transaction logic.
    await worker._process_page(data["owner_id"], data["actor_id"], "FORM_CATEGORY", None)
    return await worker._process_page(data["owner_id"], data["actor_id"], "FORM_TEMPLATE", None)


@pytest.mark.asyncio
@pytest.mark.parametrize("customer_race", ["copy"], indirect=True)
@pytest.mark.parametrize("kind", ["template", "category"])
@pytest.mark.parametrize("worker_first", [False, True])
async def test_owned_category_projection_retirement(
        committed_session_factory, owned_taxonomy, monkeypatch, kind, worker_first):
    data, task = owned_taxonomy, None
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
            else:
                connection = await outer.connection()
                async with AsyncSession(bind=connection, expire_on_commit=False,
                        join_transaction_mode="create_savepoint") as projecting:
                    result = await process(projecting, data, monkeypatch)
                    pid = await retiring.scalar(text("SELECT pg_backend_pid()"))

                    async def retirement():
                        async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                            actor = await retiring.get(User, data["actor_id"])
                            return await retire(retiring, actor, data, kind)

                    task = asyncio.create_task(retirement())
                    await wait_for_blocker(projecting, pid, task)
                    await projecting.close()
                    await outer.commit()
                    assert (await asyncio.wait_for(task, 15))["status"] == "RETIRED"
        assert result == {"checked": 1, "normalized": 1, "blocked": 1, "next_cursor": None}
        async with committed_session_factory() as db:
            owned = await db.get(FormTemplate, data["owned_template_id"])
            assert owned.version == 2 and owned.category_key == data["owned_category_slug"]
            assert owned.category_id == data["owned_category_id"] and owned.is_active
            assert owned.settings == data["original_settings"]
            source = await db.get(FormTemplate, data["source_template"])
            assert source.is_active == (kind == "category")
            assert owned.settings["_source_template_id"] == str(source.id)
            for target in [owned.id, *data["foreign_ids"]]:
                row = await db.get(FormTemplate, target)
                states = {(item.template_version, item.operation, item.status) for item in
                    (await db.scalars(select(FormTemplateReconciliation).where(
                        FormTemplateReconciliation.template_id == target))).all()}
                if target == owned.id:
                    assert states == {(1, "DOCUMENT_VALIDATION", "BLOCKED"),
                        (2, "DOCUMENT_VALIDATION", "BLOCKED"), (2, "CATEGORY_KEY_NORMALIZATION", "COMPLETED")}
                else:
                    assert row.version == 1 and row.category_key == "legacy-taxonomy-key"
                    assert states == {(1, "DOCUMENT_VALIDATION", "BLOCKED")}
            evidence = await db.scalar(select(CatalogueDocumentReconciliation).where(
                CatalogueDocumentReconciliation.resource_id == data["owned_category_id"],
                CatalogueDocumentReconciliation.resource_type == "FORM_CATEGORY"))
            assert evidence.status == "VALID"
            assert evidence.details["reference_projection"] == "BOUNDED_TEMPLATE_STAGE"
            assert await process(db, data, monkeypatch) == {
                "checked": 1, "normalized": 0, "blocked": 1, "next_cursor": None}
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
