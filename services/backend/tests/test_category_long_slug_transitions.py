"""Category's existing 100-character identity must survive reference transitions."""
import uuid

import pytest
from pydantic import ValidationError
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
from app.modules.registration.application.category_commands import retire_global_category
from app.modules.registration.application.template_commands import repair_catalogue_document
from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest, CatalogueRepairRequest
from app.modules.registration.schemas.form_builder import FormTemplateCreate, FormTemplateUpdate


def slug_of_length(length):
    return uuid.uuid4().hex + "x" * (length - 32)


@pytest.mark.asyncio
@pytest.mark.parametrize("length", [50, 51, 100])
@pytest.mark.parametrize("global_category", [False, True])
async def test_reviewed_category_repair_preserves_full_legacy_key_and_blocked_history(
        db, organization, super_admin, length, global_category):
    category = FormCategory(organization_id=None if global_category else organization.id,
        name="Long category review", slug=f"short-{uuid.uuid4().hex}")
    db.add(category)
    await db.flush()
    if global_category:
        db.add(FormCategoryReconciliation(category_id=category.id, category_version=1,
            operation="TAXONOMY_VALIDATION", status="BLOCKED", actor_user_id=super_admin.id))
    else:
        db.add(CatalogueDocumentReconciliation(organization_id=organization.id,
            resource_type="FORM_CATEGORY", resource_id=category.id, resource_version=1,
            operation="DOCUMENT_VALIDATION", status="BLOCKED", actor_user_id=super_admin.id))
    template = FormTemplate(organization_id=organization.id, scope_type="ORGANIZATION",
        category_id=category.id, category_key="legacy-key", name="Long category consumer",
        slug=f"consumer-{uuid.uuid4().hex}", fields=[], settings={})
    db.add(template)
    await db.flush()
    db.add(FormTemplateReconciliation(template_id=template.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED", actor_user_id=super_admin.id))
    await db.commit()
    category_id, template_id, slug = category.id, template.id, slug_of_length(length)
    args = dict(resource_type="FORM_CATEGORY", resource_id=category_id, actor=super_admin,
        payload=AggregateRepairRequest(document={"name": "Long category review", "slug": slug,
            "description": None, "icon": "ClipboardList", "sort_order": 0},
            reason="Reviewed full-length legacy taxonomy transition"),
        if_match='"1"', idempotency_key=f"long-review-{uuid.uuid4()}")
    result = await repair_aggregate_document(db, **args)
    assert result["status"] == "REPAIRED" and result["version"] == 2
    assert await repair_aggregate_document(db, **args) == result
    async with TenantContextGuard.scoped(db, organization.id):
        current = await db.get(FormTemplate, template_id, populate_existing=True)
        assert current.category_key == slug and len(current.category_key) == length and current.version == 2
        states = (await db.execute(select(FormTemplateReconciliation.template_version,
            FormTemplateReconciliation.operation, FormTemplateReconciliation.status).where(
            FormTemplateReconciliation.template_id == template_id))).all()
        assert set(states) == {(1, "DOCUMENT_VALIDATION", "BLOCKED"),
            (2, "DOCUMENT_VALIDATION", "BLOCKED"), (2, "CATEGORY_KEY_NORMALIZATION", "COMPLETED")}


@pytest.mark.asyncio
@pytest.mark.parametrize("length", [50, 51, 100])
async def test_global_retirement_preserves_full_key_without_changing_operational_purpose(
        db, organization, super_admin, length):
    source = FormCategory(name="Long source category", slug=f"source-{uuid.uuid4().hex}")
    replacement = FormCategory(name="Long target category", slug=slug_of_length(length))
    db.add_all([source, replacement])
    await db.flush()
    templates = [FormTemplate(organization_id=organization.id, scope_type="ORGANIZATION",
        category_id=source.id, category_key=key, name="Long retirement consumer",
        slug=f"retire-{uuid.uuid4().hex}", fields=[], settings={}) for key in ("legacy-key", "registration")]
    db.add_all(templates)
    await db.flush()
    db.add_all([FormTemplateReconciliation(template_id=row.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED", actor_user_id=super_admin.id) for row in templates])
    await db.commit()
    identities, target_id, slug = [row.id for row in templates], replacement.id, replacement.slug
    result = await retire_global_category(db, category_id=source.id, replacement_category_id=target_id,
        actor=super_admin, if_match='"1"', idempotency_key=f"long-retire-{uuid.uuid4()}",
        reason="Retire with an untruncated approved category identity")
    assert result["status"] == "RETIRED"
    async with TenantContextGuard.scoped(db, organization.id):
        for index, identity in enumerate(identities):
            row = await db.get(FormTemplate, identity, populate_existing=True)
            assert row.category_id == target_id and row.version == 2
            assert row.category_key == (slug if index == 0 else "registration")
            states = (await db.execute(select(FormTemplateReconciliation.template_version,
                FormTemplateReconciliation.operation, FormTemplateReconciliation.status).where(
                FormTemplateReconciliation.template_id == identity))).all()
            assert set(states) == {(1, "DOCUMENT_VALIDATION", "BLOCKED"),
                (2, "DOCUMENT_VALIDATION", "BLOCKED"), (2, "CATEGORY_REASSIGNMENT", "COMPLETED")}


@pytest.mark.asyncio
@pytest.mark.parametrize("length", [51, 100])
async def test_explicit_template_category_repair_supports_existing_category_slug_limit(
        db, super_admin, length):
    category = FormCategory(name="Full length repair target", slug=slug_of_length(length))
    template = FormTemplate(name="Explicit long reference repair", scope_type="GLOBAL",
        slug=f"repair-{uuid.uuid4().hex}", category_key="legacy-key", fields=[], settings={})
    db.add_all([category, template])
    await db.flush()
    db.add(FormTemplateReconciliation(template_id=template.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED", actor_user_id=super_admin.id))
    await db.commit()
    identity, target_id, slug = template.id, category.id, category.slug
    result = await repair_catalogue_document(db, template_id=identity, actor=super_admin,
        payload=CatalogueRepairRequest(document={"fields": [], "settings": {}}, replacement_category_id=target_id,
            reason="Reviewed full-length category reference repair"),
        if_match='"1"', idempotency_key=f"long-template-{uuid.uuid4()}")
    assert result["status"] == "REPAIRED"
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        current = await db.scalar(select(FormTemplate).where(FormTemplate.id == identity)
            .execution_options(shared_form_catalogue=True, populate_existing=True))
        assert current.category_key == slug and current.category_id == target_id and current.version == 2


@pytest.mark.parametrize("schema", [FormTemplateCreate, FormTemplateUpdate])
def test_template_contract_supports_100_but_rejects_101_character_keys(schema):
    values = {"category_key": "x" * 100}
    if schema is FormTemplateCreate:
        values["name"] = "Long category template"
    assert schema.model_validate(values).category_key == "x" * 100
    with pytest.raises(ValidationError):
        schema.model_validate({**values, "category_key": "x" * 101})
