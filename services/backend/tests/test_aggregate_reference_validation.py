"""Old aggregate approvals cannot conceal invalid operational bindings."""
from contextlib import asynccontextmanager
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.abstracts.models import AbstractForm
from app.modules.platform.models.organization import Organization
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest


async def seed(db, event, kind, defect):
    owner = event.organization_id
    foreign = Organization(name="Foreign aggregate source", slug=f"aggregate-owner-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    category = FormCategory(name="Aggregate category", slug=f"aggregate-{uuid.uuid4().hex}", is_system=True,
        organization_id=foreign.id if defect == "parent_category" else None)
    db.add(category)
    await db.flush()
    template = FormTemplate(name="Aggregate source", slug=f"aggregate-source-{uuid.uuid4().hex}",
        organization_id=foreign.id if defect == "foreign" else owner if defect in {"other_event", "conflicting_events"} else None,
        scope_type="ORGANIZATION" if defect == "foreign" else "EVENT" if defect in {"other_event", "conflicting_events"} else "GLOBAL",
        category_id=category.id, category_key="survey" if defect == "wrong_kind" else "registration" if kind == "REGISTRATION_FORM" else "abstract",
        is_active=defect != "retired", fields=[], settings={})
    if defect in {"other_event", "conflicting_events"}:
        template.settings = {"_event_id": str(uuid.uuid4()) if defect == "other_event" else str(event.id),
            "event_id": str(uuid.uuid4())}
    db.add(template)
    await db.flush()
    if kind == "REGISTRATION_FORM":
        row = RegistrationFormConfig(event_id=event.id, template_id=template.id, fields=[], settings={})
    else:
        row = AbstractForm(organization_id=owner, event_id=event.id, schema={"fields": [], "settings": {}, "template_id": str(template.id)})
    db.add(row)
    await db.flush()
    row_id = row.id
    db.add(CatalogueDocumentReconciliation(organization_id=owner, event_id=event.id,
        resource_type=kind, resource_id=row_id, resource_version=1,
        operation="DOCUMENT_VALIDATION", status="VALID", details={"historical": True}))
    await db.commit()
    return row_id, template.id


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["REGISTRATION_FORM", "ABSTRACT_FORM"])
@pytest.mark.parametrize("defect", ["foreign", "retired", "other_event", "conflicting_events", "wrong_kind", "parent_category", "valid"])
async def test_cohort_rechecks_old_approvals_and_keeps_history(db, event, super_admin, monkeypatch, kind, defect):
    from app.tasks import catalogue_reconciliation as worker
    row_id, _ = await seed(db, event, kind, defect)
    owner, actor_id = event.organization_id, super_admin.id

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    first = await worker._process_page(owner, actor_id, kind, None)
    second = await worker._process_page(owner, actor_id, kind, None)
    invalid = defect != "valid"
    assert first["blocked"] == second["blocked"] == int(invalid)
    async with TenantContextGuard.scoped(db, owner):
        records = (await db.scalars(select(CatalogueDocumentReconciliation).where(
            CatalogueDocumentReconciliation.resource_id == row_id))).all()
        assert next(r for r in records if r.resource_version == 1 and r.operation == "DOCUMENT_VALIDATION").details == {"historical": True}
        assert len(records) == (3 if invalid else 1)
        model = RegistrationFormConfig if kind == "REGISTRATION_FORM" else AbstractForm
        row = await db.get(model, row_id, populate_existing=True)
        assert row.version == (2 if invalid else 1)


@pytest.mark.asyncio
async def test_reviewed_registration_detachment_preserves_valid_category_and_history(db, event, super_admin, monkeypatch):
    from app.tasks import catalogue_reconciliation as worker
    from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
    row_id, previous_template = await seed(db, event, "REGISTRATION_FORM", "foreign")
    owner, actor_id, platform_id = event.organization_id, super_admin.id, super_admin.organization_id
    category = FormCategory(name="Retained valid category", slug=f"retained-{uuid.uuid4().hex}", is_system=True)
    db.add(category)
    await db.flush()
    row = await db.get(RegistrationFormConfig, row_id)
    row.category_id = category.id
    category_id = category.id
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    await worker._process_page(owner, actor_id, "REGISTRATION_FORM", None)
    args = dict(resource_type="REGISTRATION_FORM", resource_id=row_id, actor=super_admin,
        payload=AggregateRepairRequest(document={"fields": [], "settings": {}}, reason="Reviewed invalid operational binding removal"),
        if_match='"2"', idempotency_key=f"aggregate-detach-{uuid.uuid4()}")
    with pytest.raises(HTTPException) as exc:
        await repair_aggregate_document(db, **args)
    assert exc.value.status_code == 409
    async with TenantContextGuard.scoped(db, platform_id):
        actor = await db.get(type(super_admin), actor_id, populate_existing=True)
    args["actor"] = actor
    args["payload"] = args["payload"].model_copy(update={"detach_invalid_registration_references": True})
    result = await repair_aggregate_document(db, **args)
    assert result["version"] == 3 and await repair_aggregate_document(db, **args) == result
    async with TenantContextGuard.scoped(db, owner):
        row = await db.get(RegistrationFormConfig, row_id, populate_existing=True)
        assert row.template_id is None and row.category_id == category_id
        record = await db.scalar(select(CatalogueDocumentReconciliation).where(
            CatalogueDocumentReconciliation.resource_id == row_id,
            CatalogueDocumentReconciliation.operation == "CATALOGUE_REF_DETACHMENT"))
        assert record.details["previous_template_id"] == str(previous_template)
        audit = (await db.scalars(select(AuditLog).where(AuditLog.resource_id == row_id,
            AuditLog.action_type == "CATALOGUE_AGGREGATE_EXPLICIT_REPAIR"))).one()
        assert audit.row_hash == compute_audit_hash(audit)
