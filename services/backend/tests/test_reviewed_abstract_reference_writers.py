"""Reviewed document repair is not a bypass around binding ownership/lifecycle."""
from contextlib import asynccontextmanager
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.abstracts.models import AbstractForm
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest


@pytest.mark.asyncio
@pytest.mark.parametrize("defect", ["retired_parent", "foreign_parent", "conflicting_events", "valid"])
async def test_reviewed_abstract_reference_uses_shared_current_scope_checks(db, event, super_admin, monkeypatch, defect):
    from app.tasks import catalogue_reconciliation as worker
    owner, actor_id = event.organization_id, super_admin.id
    foreign = Organization(name="Foreign reviewed parent", slug=f"foreign-reviewed-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    category = FormCategory(name="Reviewed parent", slug="abstract", is_system=True,
        organization_id=foreign.id if defect == "foreign_parent" else None, is_active=defect != "retired_parent")
    db.add(category)
    await db.flush()
    source = FormTemplate(name="Reviewed reference source", slug=f"reviewed-abstract-{uuid.uuid4().hex}",
        category_key="abstract", category_id=category.id,
        scope_type="EVENT" if defect == "conflicting_events" else "GLOBAL",
        organization_id=owner if defect == "conflicting_events" else None, fields=[],
        settings={"_event_id": str(event.id), "event_id": str(uuid.uuid4())} if defect == "conflicting_events" else {})
    row = AbstractForm(organization_id=owner, event_id=event.id,
        schema={"fields": [], "settings": {"custom_js": "Requires reviewed replacement"}})
    db.add_all([source, row])
    await db.commit()
    row_id, source_id, key = row.id, source.id, f"reviewed-abstract-reference-{uuid.uuid4()}"

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    assert (await worker._process_page(owner, actor_id, "ABSTRACT_FORM", None))["blocked"] == 1
    arguments = dict(resource_type="ABSTRACT_FORM", resource_id=row_id, actor=super_admin,
        if_match='"1"', idempotency_key=key, payload=AggregateRepairRequest(
            reason="Reviewed abstract repair retains only an authorised active binding",
            document={"fields": [], "settings": {}, "template_id": str(source_id)}))
    if defect == "valid":
        result = await repair_aggregate_document(db, **arguments)
        assert result["version"] == 2 and await repair_aggregate_document(db, **arguments) == result
        return
    with pytest.raises(HTTPException) as denied:
        await repair_aggregate_document(db, **arguments)
    assert denied.value.status_code == 409
    assert denied.value.detail["code"] == "ABSTRACT_TEMPLATE_RECONCILIATION_REQUIRED"
    async with TenantContextGuard.scoped(db, owner):
        saved = await db.get(AbstractForm, row_id, populate_existing=True)
        assert saved.version == 1 and "template_id" not in saved.schema
        assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key)) is None
