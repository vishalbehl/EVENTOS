"""Bounded global category/template stages retain reference-writer ordering."""
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
from app.modules.registration.application.template_commands import retire_global_template
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.tasks import catalogue_reconciliation as worker
from tests.test_catalogue_retirement_concurrency import race_fixture, retire, wait_for_blocker


async def process(db, data, monkeypatch):
    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    cursor = None
    while True:
        category_page = await worker._global_category_page(data["actor_id"], cursor)
        if category_page["next_cursor"] is None:
            break
        advanced = uuid.UUID(category_page["next_cursor"])
        assert cursor is None or advanced > cursor
        cursor = advanced
    return await worker._global_template_page(data["actor_id"], None)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["template", "category"])
@pytest.mark.parametrize("worker_first", [False, True])
async def test_category_projection_worker_retirement(
        committed_session_factory, race_fixture, monkeypatch, kind, worker_first):
    data, task = race_fixture, None
    async with committed_session_factory() as db:
        for template_id in (data["source_template"], data["replacement_template"]):
            row = await db.get(FormTemplate, template_id)
            row.category_key = "legacy-taxonomy-key"
        await db.commit()
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
                    assert result["blocked"] == 0
                    assert result["normalized"] == (2 if kind == "template" else 0)
            else:
                connection = await outer.connection()
                async with AsyncSession(bind=connection, expire_on_commit=False,
                        join_transaction_mode="create_savepoint") as projecting:
                    result = await process(projecting, data, monkeypatch)
                    assert result["normalized"] == 2 and result["blocked"] == 0
                    pid = await retiring.scalar(text("SELECT pg_backend_pid()"))

                    async def retirement():
                        async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                            actor = await retiring.get(User, data["actor_id"])
                            if kind == "category":
                                return await retire(retiring, actor, data, kind)
                            return await retire_global_template(retiring, actor=actor,
                                template_id=data["source_template"], replacement_template_id=data["replacement_template"],
                                if_match='"2"', idempotency_key=f"taxonomy-worker-{uuid.uuid4()}",
                                reason="Retire the committed normalized template version")

                    task = asyncio.create_task(retirement())
                    await wait_for_blocker(projecting, pid, task)
                    await projecting.close()
                    await outer.commit()
                    assert (await asyncio.wait_for(task, 15))["status"] == "RETIRED"
        async with committed_session_factory() as db:
            before = set((await db.scalars(select(FormTemplate.id))).all())
            source = await db.get(FormTemplate, data["source_template"])
            replacement = await db.get(FormTemplate, data["replacement_template"])
            assert source.version == (2 if kind == "category" and not worker_first else 3)
            assert replacement.version == (3 if worker_first and kind == "category" else 2)
            assert source.is_active == (kind == "category") and replacement.is_active
            for row in (source, replacement):
                parent = await db.get(FormCategory, row.category_id)
                assert parent.is_active and parent.deleted_at is None
                assert row.category_key == parent.slug
                lineages = list((await db.scalars(select(FormTemplateReconciliation).where(
                    FormTemplateReconciliation.template_id == row.id,
                    FormTemplateReconciliation.operation == "CATEGORY_KEY_NORMALIZATION"))).all())
                assert len(lineages) == (0 if kind == "category" and not worker_first else 1)
            again = await process(db, data, monkeypatch)
            assert again["normalized"] == 0 and again["blocked"] == 0
            assert set((await db.scalars(select(FormTemplate.id))).all()) == before
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
