"""Real accepted-owner settings writes must distinguish shared from foreign catalogues."""
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.platform.models.organization import Organization
from app.modules.registration.application.commands import RegistrationFormCommandService
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.schemas.registration_form_config import RegistrationFormConfigUpdate
from tests.conftest import activate_event_for_test


@pytest.mark.asyncio
@pytest.mark.parametrize("source_scope", ["shared", "foreign", "retired"])
async def test_registration_save_revalidates_catalogue_scope_and_preserves_lineage(db, event, organizer, source_scope):
    await activate_event_for_test(db, event)
    foreign = Organization(name="Foreign catalogue fixture", slug=f"foreign-catalogue-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    category = FormCategory(name="Registration", slug="registration", is_system=True)
    db.add(category)
    await db.flush()
    template = FormTemplate(name="Scoped registration source", slug=f"scope-source-{uuid.uuid4().hex}",
        organization_id=foreign.id if source_scope == "foreign" else None,
        scope_type="ORGANIZATION" if source_scope == "foreign" else "GLOBAL",
        category_key="registration", category_id=category.id, is_active=source_scope != "retired",
        fields=[], settings={})
    db.add(template)
    await db.commit()
    source_id, category_id = template.id, category.id
    async with TenantContextGuard.scoped(db, event.organization_id):
        arguments = dict(event=event, actor_user_id=organizer.id, if_match='"1"',
            idempotency_key=f"scoped-form-save-{uuid.uuid4()}",
            payload=RegistrationFormConfigUpdate(template_id=str(source_id), category_id=category_id,
                fields=[], settings={}))
        if source_scope != "shared":
            with pytest.raises(HTTPException) as denied:
                await RegistrationFormCommandService.update(db, **arguments)
            assert denied.value.status_code in {404, 409}
            return
        saved = await RegistrationFormCommandService.update(db, **arguments)
        assert saved["version"] == 2
        assert saved["settings"]["_source_template_id"] == str(source_id)
        selected_id = uuid.UUID(saved["template_id"])
        assert selected_id != source_id
        copy = await db.scalar(select(FormTemplate).where(FormTemplate.id == selected_id))
        assert copy.organization_id == event.organization_id and copy.scope_type == "EVENT"
        assert copy.category_id == category_id
        # Settings-only writes recheck retained references and must not silently
        # lose the shared source provenance on a later event-copy save.
        second = await RegistrationFormCommandService.update(db, event=event,
            actor_user_id=organizer.id, if_match='"2"',
            idempotency_key=f"scoped-form-repeat-{uuid.uuid4()}",
            payload=RegistrationFormConfigUpdate(settings={}))
        assert second["version"] == 3
        assert second["settings"]["_source_template_id"] == str(source_id)
