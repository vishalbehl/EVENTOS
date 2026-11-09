"""Real PostgreSQL retirement and registration evidence, without mocked authority."""
import uuid

import pytest
from sqlalchemy import select

from app.modules.registration.application.category_commands import retire_global_category
from app.modules.registration.application.template_commands import retire_global_template
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_category import FormCategoryReconciliation
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.models.registration_form_config import RegistrationFormConfig


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["category", "template"])
async def test_global_retirement_reassigns_registration_and_carries_blocked_evidence(
    db, event, super_admin, kind,
):
    source_category = FormCategory(name="Source category", slug=f"source-{uuid.uuid4().hex}")
    replacement_category = FormCategory(name="Replacement category", slug=f"replacement-{uuid.uuid4().hex}")
    db.add_all([source_category, replacement_category])
    await db.flush()
    source = FormTemplate(name="Source template", slug=f"source-{uuid.uuid4().hex}",
        category_id=source_category.id, category_key="registration", scope_type="GLOBAL", fields=[], settings={})
    replacement = FormTemplate(name="Replacement template", slug=f"replacement-{uuid.uuid4().hex}",
        category_id=source_category.id, category_key="registration", scope_type="GLOBAL", fields=[], settings={})
    db.add_all([source, replacement])
    await db.flush()
    form = RegistrationFormConfig(event_id=event.id, template_id=source.id,
        category_id=source_category.id, fields=[], settings={}, version=1)
    db.add(form)
    await db.flush()
    db.add(CatalogueDocumentReconciliation(organization_id=event.organization_id,
        event_id=event.id, resource_type="REGISTRATION_FORM", resource_id=form.id,
        resource_version=1, operation="DOCUMENT_VALIDATION", status="BLOCKED",
        reason="Reviewed repair is still required", details={}))
    await db.commit()
    key = f"retirement-{uuid.uuid4()}"
    arguments = dict(actor=super_admin, if_match='"1"', idempotency_key=key,
        reason="Approved isolated catalogue lifecycle verification")
    if kind == "category":
        operation = retire_global_category
        arguments.update(category_id=source_category.id, replacement_category_id=replacement_category.id)
    else:
        operation = retire_global_template
        arguments.update(template_id=source.id, replacement_template_id=replacement.id)
    result = await operation(db, **arguments)
    assert result["status"] == "RETIRED"
    await db.refresh(form)
    assert form.version == 2
    assert (form.category_id == replacement_category.id if kind == "category" else form.template_id == replacement.id)
    evidence = list((await db.scalars(select(CatalogueDocumentReconciliation).where(
        CatalogueDocumentReconciliation.resource_id == form.id,
    ))).all())
    assert {(row.resource_version, row.operation, row.status) for row in evidence} == {
        (1, "DOCUMENT_VALIDATION", "BLOCKED"),
        (2, "DOCUMENT_VALIDATION", "BLOCKED"),
        (2, f"{kind.upper()}_REASSIGNMENT", "COMPLETED"),
    }
    assert await operation(db, **arguments) == result
    await db.refresh(form)
    assert form.version == 2


@pytest.mark.asyncio
async def test_reviewed_global_category_repair_preserves_history_and_replay(db, super_admin):
    from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
    from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest
    from app.database import tenant_org_id
    category = FormCategory(name="Reviewed global category", slug=f"global-review-{uuid.uuid4().hex}")
    db.add(category)
    await db.flush()
    db.add(FormCategoryReconciliation(category_id=category.id, category_version=1,
        operation="TAXONOMY_VALIDATION", status="BLOCKED", details={"duplicate_owner_slug_count": 0}))
    await db.commit()
    arguments = dict(resource_type="FORM_CATEGORY", resource_id=category.id,
        payload=AggregateRepairRequest(document={"name": category.name, "slug": category.slug,
            "description": None, "icon": "ClipboardList", "sort_order": 0},
            reason="Reviewed unchanged global taxonomy after corrected duplicate detection"),
        actor=super_admin, if_match='"1"', idempotency_key=f"review-{uuid.uuid4()}")
    token = tenant_org_id.set(super_admin.organization_id)
    try:
        result = await repair_aggregate_document(db, **arguments)
        assert result["version"] == 2
        assert await repair_aggregate_document(db, **arguments) == result
        evidence = list((await db.scalars(select(FormCategoryReconciliation).where(
            FormCategoryReconciliation.category_id == category.id))).all())
        assert {(row.category_version, row.operation, row.status) for row in evidence} == {
            (1, "TAXONOMY_VALIDATION", "BLOCKED"),
            (1, "EXPLICIT_REPAIR", "COMPLETED"),
            (2, "TAXONOMY_VALIDATION", "VALID"),
        }
    finally:
        tenant_org_id.reset(token)
