"""Ordinary writes cannot carry invalid catalogue links into a new version."""
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.abstracts.models import AbstractForm
from app.modules.abstracts.application.commands import AbstractConfigurationCommandService
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.registration.application.commands import RegistrationFormCommandService
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.schemas.registration_form_config import RegistrationFormConfigUpdate
from tests.conftest import activate_event_for_test


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["registration", "abstract"])
@pytest.mark.parametrize("defect", ["retired_parent", "foreign_parent", "conflicting_events", "valid"])
async def test_status_only_write_validates_full_retained_reference(db, event, organizer, kind, defect):
    await activate_event_for_test(db, event, abstracts=kind == "abstract")
    owner, actor_id = event.organization_id, organizer.id
    foreign = Organization(name="Foreign reference owner", slug=f"foreign-parent-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    category = FormCategory(name="Parent reference", slug=kind, is_system=True,
        organization_id=foreign.id if defect == "foreign_parent" else None, is_active=defect != "retired_parent")
    db.add(category)
    await db.flush()
    source = FormTemplate(name="Retained source", slug=f"retained-{uuid.uuid4().hex}", category_key=kind,
        category_id=category.id, scope_type="EVENT" if defect == "conflicting_events" else "GLOBAL",
        organization_id=owner if defect == "conflicting_events" else None, fields=[],
        settings={"_event_id": str(event.id), "event_id": str(uuid.uuid4())} if defect == "conflicting_events" else {})
    db.add(source)
    await db.flush()
    row = (RegistrationFormConfig(event_id=event.id, template_id=source.id, fields=[], settings={})
        if kind == "registration" else AbstractForm(organization_id=owner, event_id=event.id,
            title="Retained abstract form", schema={"fields": [], "settings": {}, "template_id": str(source.id)}))
    db.add(row)
    await db.commit()
    row_id, key = row.id, f"retained-form-{uuid.uuid4()}"

    async def save():
        if kind == "registration":
            return await RegistrationFormCommandService.update(db, event=event, actor_user_id=actor_id,
                if_match='"1"', idempotency_key=key, payload=RegistrationFormConfigUpdate(is_live=False))
        return await AbstractConfigurationCommandService(db).update_form(event=event, user=organizer,
            expected_version='"1"', idempotency_key=key,
            payload={"title": "Retained abstract form", "schema": {"fields": [], "settings": {}}, "publish": False})

    async with TenantContextGuard.scoped(db, owner):
        if defect == "valid":
            result = await save()
            assert (result["version"] if isinstance(result, dict) else result.version) == 2
            return
        with pytest.raises(HTTPException) as denied:
            await save()
        assert denied.value.status_code == 409
        assert denied.value.detail["code"] == ("FORM_TEMPLATE_RECONCILIATION_REQUIRED"
            if kind == "registration" else "ABSTRACT_TEMPLATE_RECONCILIATION_REQUIRED")
        model = RegistrationFormConfig if kind == "registration" else AbstractForm
        saved = await db.get(model, row_id, populate_existing=True)
        assert saved.version == 1
        assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key)) is None


@pytest.mark.asyncio
async def test_malformed_historical_abstract_link_requires_review(db, event, organizer):
    await activate_event_for_test(db, event, abstracts=True)
    owner, actor_id = event.organization_id, organizer.id
    row = AbstractForm(organization_id=owner, event_id=event.id, title="Malformed historical link",
        schema={"fields": [], "settings": {}, "template_id": "not-a-template-identifier"})
    db.add(row)
    await db.commit()
    row_id, key = row.id, f"malformed-retained-{uuid.uuid4()}"
    async with TenantContextGuard.scoped(db, owner):
        with pytest.raises(HTTPException) as denied:
            await AbstractConfigurationCommandService(db).update_form(event=event, user=organizer,
                expected_version='"1"', idempotency_key=key,
                payload={"title": "Malformed historical link", "schema": {"fields": [], "settings": {}}})
        assert denied.value.status_code == 409
        assert denied.value.detail["code"] == "ABSTRACT_TEMPLATE_RECONCILIATION_REQUIRED"
        saved = await db.get(AbstractForm, row_id, populate_existing=True)
        assert saved.version == 1 and saved.schema["template_id"] == "not-a-template-identifier"
        assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key)) is None


@pytest.mark.asyncio
async def test_first_custom_abstract_save_uses_a_real_owned_event(db, event, organizer):
    await activate_event_for_test(db, event, abstracts=True)
    async with TenantContextGuard.scoped(db, event.organization_id):
        result = await AbstractConfigurationCommandService(db).update_form(event=event, user=organizer,
            expected_version='"1"', idempotency_key=f"first-custom-abstract-{uuid.uuid4()}",
            payload={"title": "First custom abstract form", "schema": {"fields": [], "settings": {}}})
        assert result.version == 2 and result.form_schema["template_id"] == "tpl_abstract_submission"
