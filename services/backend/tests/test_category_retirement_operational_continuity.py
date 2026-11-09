"""Category replacement must preserve the usability of a live form binding."""
import uuid

import pytest

from app.core.tenant_context import TenantContextGuard
from app.modules.registration.application.aggregate_reference_validation import aggregate_reference_issues
from app.modules.registration.application.category_commands import retire_global_category
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.application.template_commands import TemplateCommands, repair_catalogue_document
from app.modules.registration.schemas.form_builder import FormTemplateUpdate
from app.modules.registration.schemas.catalogue_contracts import CatalogueRepairRequest


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["registration", "abstract", "survey", "speaker", "speaker_intake"])
async def test_category_reassignment_preserves_live_registration_binding(db, event, super_admin, kind):
    from app.modules.abstracts.models import AbstractForm
    from app.modules.registration.models.form_template import EventFormTemplateBinding
    from app.modules.registration.application.operational_binding_commands import get_operational_binding
    owner = event.organization_id
    original = FormCategory(name="Original purpose", slug=kind, is_system=True)
    replacement = FormCategory(name="Reviewed taxonomy", slug=f"reviewed-{uuid.uuid4().hex}", is_system=True)
    db.add_all([original, replacement])
    await db.flush()
    template = FormTemplate(name="Live registration blueprint", slug=f"live-{uuid.uuid4().hex}",
        scope_type="GLOBAL" if kind in {"registration", "abstract"} else "EVENT",
        organization_id=None if kind in {"registration", "abstract"} else owner,
        category_id=original.id, category_key=kind, fields=[],
        settings={} if kind in {"registration", "abstract"} else {"_event_id": str(event.id)})
    db.add(template)
    await db.flush()
    purpose = "SURVEY" if kind == "survey" else "SPEAKER_INTAKE"
    if kind == "registration":
        form = RegistrationFormConfig(event_id=event.id, template_id=template.id,
            category_id=original.id, fields=[], settings={})
    elif kind == "abstract":
        form = AbstractForm(organization_id=owner, event_id=event.id,
            schema={"fields": [], "settings": {}, "template_id": str(template.id)})
    else:
        form = EventFormTemplateBinding(organization_id=owner, event_id=event.id,
            template_id=template.id, purpose=purpose)
    db.add(form)
    await db.commit()
    async with TenantContextGuard.scoped(db, owner):
        if kind in {"registration", "abstract"}:
            before = await aggregate_reference_issues(db, rows=[form], organization_id=owner,
                resource_type="REGISTRATION_FORM" if kind == "registration" else "ABSTRACT_FORM")
            assert before[form.id] == []
        else:
            assert (await get_operational_binding(db, event=event, purpose=purpose)).template_id == template.id
    result = await retire_global_category(db, category_id=original.id,
        replacement_category_id=replacement.id, actor=super_admin, if_match='"1"',
        idempotency_key=f"live-category-reassignment-{uuid.uuid4()}",
        reason="Reviewed category replacement must preserve live form operation")
    assert result["status"] == "RETIRED"
    async with TenantContextGuard.scoped(db, owner):
        await db.refresh(form)
        if kind == "registration":
            assert form.category_id == replacement.id
        if kind in {"registration", "abstract"}:
            after = await aggregate_reference_issues(db, rows=[form], organization_id=owner,
                resource_type="REGISTRATION_FORM" if kind == "registration" else "ABSTRACT_FORM")
            assert after[form.id] == [], "Taxonomy changes must not change a template's operational purpose"
        else:
            assert (await get_operational_binding(db, event=event, purpose=purpose)).template_id == template.id
        await db.refresh(template)
        assert template.category_id == replacement.id and template.category_key == kind
    if kind in {"registration", "abstract"}:
        updated = await TemplateCommands.execute(db, operation="update", actor=super_admin,
            template_id=template.id, audience="PLATFORM", if_match='"2"',
            idempotency_key=f"post-retirement-save-{uuid.uuid4()}",
            payload=FormTemplateUpdate(name="Editable after taxonomy reassignment"))
        assert updated.version == 3 and updated.category_key == kind


@pytest.mark.asyncio
async def test_existing_operational_purpose_cannot_be_changed_by_template_patch(db, super_admin):
    from fastapi import HTTPException
    from sqlalchemy import select
    from app.modules.platform.models.idempotency import IdempotencyRecord
    category = FormCategory(name="Registration category", slug="registration", is_system=True)
    db.add(category)
    await db.flush()
    template = FormTemplate(name="Stable purpose", slug=f"stable-{uuid.uuid4().hex}",
        scope_type="GLOBAL", category_id=category.id, category_key="registration", fields=[], settings={})
    db.add(template)
    await db.commit()
    template_id, platform_id = template.id, super_admin.organization_id
    key = f"purpose-patch-{uuid.uuid4()}"
    with pytest.raises(HTTPException) as denied:
        await TemplateCommands.execute(db, operation="update", actor=super_admin, audience="PLATFORM",
            template_id=template_id, if_match='"1"', idempotency_key=key,
            payload=FormTemplateUpdate(category_key="abstract"))
    assert denied.value.status_code == 409 and denied.value.detail["code"] == "TEMPLATE_PURPOSE_IMMUTABLE"
    async with TenantContextGuard.scoped(db, platform_id):
        await db.refresh(template)
        assert template.category_key == "registration" and template.version == 1
        assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key)) is None


@pytest.mark.asyncio
@pytest.mark.parametrize("slug_length", [40, 80])
async def test_reviewed_category_replacement_preserves_established_purpose(db, super_admin, slug_length):
    from app.modules.registration.models.form_template import FormTemplateReconciliation
    category = FormCategory(name="Custom taxonomy", slug=("x" * slug_length), is_system=True)
    row = FormTemplate(name="Reviewed purpose", slug=f"reviewed-purpose-{uuid.uuid4().hex}",
        scope_type="GLOBAL", category_key="registration", fields=[], settings={"custom_js": "invalid"})
    db.add_all([category, row])
    await db.flush()
    db.add(FormTemplateReconciliation(template_id=row.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED"))
    await db.commit()
    result = await repair_catalogue_document(db, template_id=row.id, actor=super_admin,
        if_match='"1"', idempotency_key=f"purpose-review-{uuid.uuid4()}",
        payload=CatalogueRepairRequest(document={"fields": [], "settings": {}},
            replacement_category_id=category.id, reason="Reviewed taxonomy must preserve operational purpose"))
    assert result["version"] == 2
    await db.refresh(row)
    assert row.category_id == category.id and row.category_key == "registration"


def test_purpose_registry_preserves_standard_codes_without_accepting_unknown_mismatches():
    from app.modules.registration.application.template_purpose import (
        OPERATIONAL_TEMPLATE_KEYS, category_key_matches, reassigned_category_key)
    for key in OPERATIONAL_TEMPLATE_KEYS:
        for slug in ("custom-taxonomy", "abstract", "x" * 80):
            assert reassigned_category_key(key, slug) == key
            assert category_key_matches(key, slug)
    assert reassigned_category_key("legacy-custom", "reviewed-custom") == "reviewed-custom"
    assert category_key_matches("reviewed-custom", "reviewed-custom")
    assert not category_key_matches("unknown-wrong-purpose", "registration")
