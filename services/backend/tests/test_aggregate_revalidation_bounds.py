"""Current aggregate validation is bounded and does not trust old approvals."""
from contextlib import asynccontextmanager
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import select, event as sa_event

from app.core.tenant_context import TenantContextGuard
from app.modules.abstracts.models import AbstractForm
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.application.aggregate_reference_validation import aggregate_reference_issues
from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest
from tests.test_aggregate_reference_validation import seed


@pytest.mark.parametrize("value", ["true", 1, None])
def test_reference_detachment_requires_strict_boolean(value):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        AggregateRepairRequest(document={"fields": [], "settings": {}},
            reason="Reviewed invalid binding removal", detach_invalid_registration_references=value)


def test_reference_detachment_requires_meaningful_reason():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        AggregateRepairRequest(document={"fields": [], "settings": {}},
            reason="        ", detach_invalid_registration_references=True)


@pytest.mark.asyncio
async def test_valid_registration_links_cannot_be_detached(db, event, super_admin, monkeypatch):
    from app.tasks import catalogue_reconciliation as worker
    row_id, template_id = await seed(db, event, "REGISTRATION_FORM", "valid")
    owner, actor_id = event.organization_id, super_admin.id
    row = await db.get(RegistrationFormConfig, row_id)
    row.settings = {"custom_js": "Invalid document with valid references"}
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    await worker._process_page(owner, actor_id, "REGISTRATION_FORM", None)
    with pytest.raises(HTTPException) as denied:
        await repair_aggregate_document(db, resource_type="REGISTRATION_FORM", resource_id=row_id,
            actor=super_admin, if_match='"2"', idempotency_key=f"valid-detach-{uuid.uuid4()}",
            payload=AggregateRepairRequest(document={"fields": [], "settings": {}},
                reason="Reviewed invalid binding removal", detach_invalid_registration_references=True))
    assert denied.value.status_code == 409
    assert denied.value.detail["code"] == "REFERENCE_DETACH_NOT_REQUIRED"
    async with TenantContextGuard.scoped(db, owner):
        row = await db.get(RegistrationFormConfig, row_id, populate_existing=True)
        assert row.template_id == template_id and row.version == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["ABSTRACT_FORM", "FORM_CATEGORY"])
async def test_registration_detachment_flag_cannot_target_other_resources(db, super_admin, kind):
    with pytest.raises(HTTPException) as denied:
        await repair_aggregate_document(db, resource_type=kind, resource_id=uuid.uuid4(),
            actor=super_admin, if_match='"1"', idempotency_key=f"wrong-detach-{uuid.uuid4()}",
            payload=AggregateRepairRequest(document={"fields": [], "settings": {}},
                reason="Reviewed invalid binding removal", detach_invalid_registration_references=True))
    assert denied.value.status_code == 409
    assert denied.value.detail["code"] == "REFERENCE_DETACH_REQUIRES_REGISTRATION_FORM"


@pytest.mark.asyncio
async def test_registration_repair_rejects_unexpected_nested_contract_fields(db, event, super_admin, monkeypatch):
    from app.tasks import catalogue_reconciliation as worker
    row_id, _ = await seed(db, event, "REGISTRATION_FORM", "foreign")
    owner, actor_id = event.organization_id, super_admin.id

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    await worker._process_page(owner, actor_id, "REGISTRATION_FORM", None)
    with pytest.raises(HTTPException) as denied:
        await repair_aggregate_document(db, resource_type="REGISTRATION_FORM", resource_id=row_id,
            actor=super_admin, if_match='"2"', idempotency_key=f"extra-fields-{uuid.uuid4()}",
            payload=AggregateRepairRequest(document={"fields": [], "settings": {}, "organization_id": str(owner)},
                reason="Reviewed invalid binding removal", detach_invalid_registration_references=True))
    assert denied.value.status_code == 422
    assert denied.value.detail["code"] == "INVALID_REGISTRATION_REPAIR_DOCUMENT"


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["REGISTRATION_FORM", "ABSTRACT_FORM"])
async def test_old_valid_document_is_rechecked_against_current_schema(db, event, super_admin, monkeypatch, kind):
    from app.tasks import catalogue_reconciliation as worker
    row_id, _ = await seed(db, event, kind, "valid")
    model = RegistrationFormConfig if kind == "REGISTRATION_FORM" else AbstractForm
    row = await db.get(model, row_id)
    if kind == "REGISTRATION_FORM":
        row.settings = {"custom_js": "unsupported historical setting"}
    else:
        row.schema = {**row.schema, "rubric": [{"key": "quality", "label": "Quality", "weight": 99}]}
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    result = await worker._process_page(event.organization_id, super_admin.id, kind, None)
    assert result["blocked"] == 1
    async with TenantContextGuard.scoped(db, event.organization_id):
        record = await db.scalar(select(CatalogueDocumentReconciliation).where(
            CatalogueDocumentReconciliation.resource_id == row_id,
            CatalogueDocumentReconciliation.resource_version == 2))
        assert record.details["issues"] == ["DOCUMENT_SCHEMA_REVALIDATION_REQUIRED"]


@pytest.mark.asyncio
async def test_inactive_abstract_retains_owned_retired_history(db, event, super_admin, monkeypatch):
    from app.tasks import catalogue_reconciliation as worker
    row_id, _ = await seed(db, event, "ABSTRACT_FORM", "retired")
    row = await db.get(AbstractForm, row_id)
    row.is_active = False
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    result = await worker._process_page(event.organization_id, super_admin.id, "ABSTRACT_FORM", None)
    assert result["blocked"] == 0
    async with TenantContextGuard.scoped(db, event.organization_id):
        row = await db.get(AbstractForm, row_id, populate_existing=True)
        assert row.version == 1


@pytest.mark.asyncio
async def test_hundred_form_bindings_use_three_metadata_queries(db, event):
    category = FormCategory(name="Bounded category", slug="abstract", is_system=True)
    db.add(category)
    await db.flush()
    roots = [FormTemplate(scope_type="GLOBAL", name="Root", slug=f"aggregate-root-{uuid.uuid4().hex}",
        category_key="abstract", category_id=category.id, fields=[], settings={}) for _ in range(100)]
    db.add_all(roots)
    await db.flush()
    rows = [AbstractForm(organization_id=event.organization_id, event_id=event.id, is_active=False,
        schema={"fields": [], "settings": {}, "template_id": str(root.id)}) for root in roots]
    db.add_all(rows)
    await db.flush()
    statements = []

    def capture(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    async with TenantContextGuard.scoped(db, event.organization_id):
        sa_event.listen(db.bind.sync_engine, "after_cursor_execute", capture)
        try:
            result = await aggregate_reference_issues(db, rows=rows, organization_id=event.organization_id,
                resource_type="ABSTRACT_FORM")
        finally:
            sa_event.remove(db.bind.sync_engine, "after_cursor_execute", capture)
    assert len(statements) == 3 and not any(result.values())
    assert "form_templates.fields" not in statements[1]


@pytest.mark.asyncio
async def test_mandatory_reference_audit_failure_rolls_back_all_changes(db, event, super_admin, monkeypatch):
    from app.tasks import catalogue_reconciliation as worker
    row_id, template_id = await seed(db, event, "REGISTRATION_FORM", "foreign")
    owner, platform_id, actor_id = event.organization_id, super_admin.organization_id, super_admin.id

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    await worker._process_page(owner, actor_id, "REGISTRATION_FORM", None)
    key = f"reference-audit-failure-{uuid.uuid4()}"

    def refuse(session, flush_context, instances):
        if any(isinstance(item, AuditLog) and item.action_type == "CATALOGUE_AGGREGATE_EXPLICIT_REPAIR" for item in session.new):
            raise RuntimeError("Injected aggregate reference audit failure")

    sa_event.listen(db.sync_session, "before_flush", refuse)
    try:
        with pytest.raises(RuntimeError, match="aggregate reference audit failure"):
            await repair_aggregate_document(db, resource_type="REGISTRATION_FORM", resource_id=row_id,
                actor=super_admin, if_match='"2"', idempotency_key=key,
                payload=AggregateRepairRequest(document={"fields": [], "settings": {}},
                    reason="Reviewed invalid binding removal", detach_invalid_registration_references=True))
    finally:
        sa_event.remove(db.sync_session, "before_flush", refuse)
    async with TenantContextGuard.scoped(db, owner):
        row = await db.get(RegistrationFormConfig, row_id, populate_existing=True)
        assert row.version == 2 and row.template_id == template_id
        assert await db.scalar(select(CatalogueDocumentReconciliation.id).where(
            CatalogueDocumentReconciliation.resource_id == row_id,
            CatalogueDocumentReconciliation.operation == "CATALOGUE_REF_DETACHMENT")) is None
    async with TenantContextGuard.scoped(db, platform_id):
        assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key)) is None
