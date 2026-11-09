"""Tenant worker normalisation versus committed global retirement commands.

Operator-owned PostgreSQL fixture: not a migrated runtime-role acceptance claim.
"""
import asyncio
from contextlib import asynccontextmanager

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.abstracts.models import AbstractForm
from app.modules.identity.models.user import User
from app.modules.registration.application.catalogue_lifecycle_locks import (
    lock_template_retirement, lock_category_retirement,
)
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.tasks import catalogue_reconciliation as worker
from tests.test_catalogue_retirement_concurrency import race_fixture, retire, wait_for_blocker
from tests.test_event_writer_retirement_races import customer_race, assert_current_references


async def prepare(factory, data):
    data["stage"] = "REGISTRATION_FORM" if data["writer_kind"] == "registration" else "ABSTRACT_FORM"
    model = RegistrationFormConfig if data["writer_kind"] == "registration" else AbstractForm
    async with factory() as db:
        async with TenantContextGuard.scoped(db, data["owner_id"]):
            row = await db.scalar(select(model).where(model.event_id == data["event_id"]))
            field = {"id": "legacy", "name": "legacy", "label": "Legacy", "type": "text"}
            if data["writer_kind"] == "registration":
                row.fields = [field]
            else:
                row.schema = {**row.schema, "fields": [field]}
            data["resource_id"] = row.id
            await db.commit()


async def process(db, data, monkeypatch):
    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    # Actual platform actor validation, tenant binding and worker commit execute.
    return await worker._process_page(data["owner_id"], data["actor_id"], data["stage"], None)


async def observe(factory, data, kind, monkeypatch):
    model = RegistrationFormConfig if data["writer_kind"] == "registration" else AbstractForm
    async with factory() as db:
        await assert_current_references(db, data, kind, writer_succeeded=True)
        row = await db.get(model, data["resource_id"], populate_existing=True)
        fields = row.fields if data["writer_kind"] == "registration" else row.schema["fields"]
        assert fields[0]["id"] == "legacy" and fields[0]["is_active"] is True
        version = row.version
        # Validate retirement's resulting version through the real worker,
        # rather than treating maintenance evidence as current VALID evidence.
        result = await process(db, data, monkeypatch)
        assert result == {"checked": 1, "normalized": 0, "blocked": 0, "next_cursor": None}
        row = await db.get(model, data["resource_id"], populate_existing=True)
        assert row.version == version
        evidence = await db.scalar(select(CatalogueDocumentReconciliation).where(
            CatalogueDocumentReconciliation.resource_type == data["stage"],
            CatalogueDocumentReconciliation.resource_id == row.id,
            CatalogueDocumentReconciliation.resource_version == version,
            CatalogueDocumentReconciliation.operation == "DOCUMENT_VALIDATION"))
        assert evidence.status == "VALID"
        await assert_current_references(db, data, kind, writer_succeeded=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("customer_race", ["registration", "abstract"], indirect=True)
@pytest.mark.parametrize("kind", ["template", "category"])
@pytest.mark.parametrize("worker_first", [False, True])
async def test_owned_aggregate_worker_retirement_ordering(
        committed_session_factory, customer_race, monkeypatch, kind, worker_first):
    data, task = customer_race, None
    await prepare(committed_session_factory, data)
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
        await observe(committed_session_factory, data, kind, monkeypatch)
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
