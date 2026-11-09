"""A resolved legacy slug is a selector, never durable mutation authority."""
import asyncio
import uuid

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import pytest
from sqlalchemy import func, select

from app.core.tenant_context import TenantContextGuard
from app.dependencies import get_db, get_current_user
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.identity.models.user import User
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.registration.application.queries import FormBuilderQueryService
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.routers.form_templates import router
from tests.conftest import activate_event_for_test
from tests.test_catalogue_retirement_concurrency import race_fixture, retire
from tests.test_event_writer_retirement_races import customer_race


@pytest.mark.asyncio
async def test_legacy_event_copy_headers_replay_and_correlated_audit(db, event, organizer):
    await activate_event_for_test(db, event)
    slug = f"survey-source-{uuid.uuid4().hex}"
    source = FormTemplate(name="Legacy survey source", slug=slug, category_key="survey", scope_type="GLOBAL",
        fields=[], settings={})
    db.add(source)
    await db.commit()
    source_id, event_id, owner_id, actor_id = source.id, event.id, event.organization_id, organizer.id
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def identity():
        return await db.scalar(select(User).where(User.id == actor_id).execution_options(populate_existing=True))

    async def database():
        async with TenantContextGuard.scoped(db, owner_id):
            yield db

    app.dependency_overrides[get_current_user] = identity
    app.dependency_overrides[get_db] = database
    path = f"/api/v1/forms/templates/tpl_{slug.replace('-', '_')}/save-as-event-copy"
    payload = {"event_id": str(event_id), "fields": [], "settings": {}}
    key = str(uuid.uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post(path, json=payload, headers={"Idempotency-Key": key})).status_code == 428
        assert (await client.post(path, json=payload, headers={"If-Match": '"1"'})).status_code == 428
        headers = {"If-Match": '"1"', "Idempotency-Key": key}
        saved = await client.post(path, json=payload, headers=headers)
        assert saved.status_code == 200, saved.text
        assert (await client.post(path, json=payload, headers=headers)).json() == saved.json()
    async with TenantContextGuard.scoped(db, owner_id):
        copies = list((await db.scalars(select(FormTemplate).where(FormTemplate.organization_id == owner_id,
            FormTemplate.scope_type == "EVENT"))).all())
        assert len(copies) == 1 and copies[0].version == 1
        assert copies[0].settings["_source_template_id"] == str(source_id)
        receipt = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == key))
        assert receipt.status == "COMPLETED"
        audits = list((await db.scalars(select(AuditLog).where(AuditLog.correlation_id == receipt.id))).all())
        assert len(audits) == 1 and audits[0].action_type == "EVENT_FORM_TEMPLATE_SAVED"
        assert audits[0].row_hash == compute_audit_hash(audits[0])


@pytest.mark.asyncio
@pytest.mark.parametrize("customer_race", ["copy"], indirect=True)
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_retirement_after_legacy_resolution_is_rechecked_by_the_write(
        committed_session_factory, customer_race, monkeypatch, kind):
    data, task = customer_race, None
    resolved, resume = asyncio.Event(), asyncio.Event()
    original = FormBuilderQueryService.get_template_by_slug

    async def pause_after_actual_lookup(self, **kwargs):
        result = await original(self, **kwargs)
        assert result.id == data["source_template"]
        resolved.set()
        await asyncio.wait_for(resume.wait(), 15)
        return result

    monkeypatch.setattr(FormBuilderQueryService, "get_template_by_slug", pause_after_actual_lookup)
    try:
        async with committed_session_factory() as writing, committed_session_factory() as retiring:
            source = await writing.get(FormTemplate, data["source_template"])
            slug = source.slug
            app = FastAPI()
            app.include_router(router, prefix="/api/v1")

            async def identity():
                return await writing.get(User, data["customer_actor_id"])

            async def database():
                async with TenantContextGuard.scoped(writing, data["owner_id"]):
                    yield writing

            app.dependency_overrides[get_current_user] = identity
            app.dependency_overrides[get_db] = database
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                task = asyncio.create_task(client.post(f"/api/v1/forms/templates/{slug}/save-as-event-copy",
                    json={"event_id": str(data["event_id"]), "fields": [], "settings": {}},
                    headers={"If-Match": '"1"', "Idempotency-Key": data["retry_key"]}))
                await asyncio.wait_for(resolved.wait(), 10)
                async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                    actor = await retiring.get(User, data["actor_id"])
                    assert (await retire(retiring, actor, data, kind))["status"] == "RETIRED"
                resume.set()
                response = await asyncio.wait_for(task, 15)
                assert response.status_code == (409 if kind == "template" else 412)
                assert response.json()["detail"]["code"] == (
                    "SOURCE_TEMPLATE_INACTIVE" if kind == "template" else "RESOURCE_VERSION_CONFLICT")
        async with committed_session_factory() as observer:
            assert await observer.scalar(select(func.count()).select_from(FormTemplate).where(
                FormTemplate.organization_id == data["owner_id"], FormTemplate.scope_type == "EVENT")) == 0
            assert await observer.scalar(select(IdempotencyRecord.id).where(
                IdempotencyRecord.idempotency_key == data["retry_key"])) is None
            assert await observer.scalar(select(AuditLog.id).where(AuditLog.organization_id == data["owner_id"],
                AuditLog.action_type == "EVENT_FORM_TEMPLATE_SAVED")) is None
    finally:
        resume.set()
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
