"""Historical roots do not grant access and cannot cross template ownership."""
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.platform.models.organization import Organization
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.application.commands import FormTemplateCommandService, RegistrationFormCommandService
from app.modules.registration.application.template_commands import repair_catalogue_document
from app.modules.registration.schemas.catalogue_contracts import CatalogueRepairRequest
from app.modules.registration.schemas.form_builder import FormTemplateSaveEventCopy
from app.modules.registration.schemas.registration_form_config import RegistrationFormConfigUpdate
from tests.conftest import activate_event_for_test


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["repair", "copy", "registration"])
@pytest.mark.parametrize("root_kind", ["global", "retired", "deleted", "owned", "foreign", "event", "missing", "self", "none"])
async def test_lineage_writers_validate_owner_without_destroying_history(db, event, organizer, super_admin,
                                                                       entry, root_kind):
    await activate_event_for_test(db, event)
    owner, event_id, platform_id = event.organization_id, event.id, super_admin.organization_id
    foreign = Organization(name="Foreign provenance proof", slug=f"lineage-owner-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    category = FormCategory(name="Lineage category", slug="registration" if entry == "registration" else "survey",
        is_system=True)
    db.add(category)
    await db.flush()
    root_id = uuid.uuid4()
    if root_kind not in {"missing", "self", "none"}:
        db.add(FormTemplate(id=root_id, name="Provenance root", slug=f"root-{root_id.hex}",
            organization_id=foreign.id if root_kind == "foreign" else owner if root_kind in {"owned", "event"} else None,
            scope_type="EVENT" if root_kind == "event" else "ORGANIZATION" if root_kind in {"owned", "foreign"} else "GLOBAL",
            category_id=category.id, category_key=category.slug, fields=[], settings={},
            is_active=root_kind != "retired", deleted_at=datetime.now(timezone.utc) if root_kind == "deleted" else None))
    copy_id = uuid.uuid4()
    settings = {"_event_id": str(event_id)}
    if root_kind != "none":
        settings["_source_template_id"] = str(copy_id if root_kind == "self" else root_id)
    db.add(FormTemplate(id=copy_id, name="Owned event copy", slug=f"copy-{copy_id.hex}",
        organization_id=owner, scope_type="EVENT", category_id=category.id,
        category_key=category.slug, fields=[], settings=settings))
    await db.flush()
    if entry == "repair":
        db.add(FormTemplateReconciliation(template_id=copy_id, template_version=1,
            operation="DOCUMENT_VALIDATION", status="BLOCKED"))
    elif entry == "registration":
        db.add(RegistrationFormConfig(event_id=event_id, template_id=copy_id, category_id=category.id,
            fields=[], settings={}, version=1))
    await db.commit()
    allowed = root_kind not in {"foreign", "event", "missing"}

    async def write():
        key = f"lineage-{uuid.uuid4()}"
        if entry == "repair":
            return await repair_catalogue_document(db, template_id=copy_id, actor=super_admin,
                payload=CatalogueRepairRequest(document={"fields": [], "settings": {}},
                    reason="Reviewed historical lineage preservation"), if_match='"1"', idempotency_key=key)
        if entry == "copy":
            return await FormTemplateCommandService.save_event_copy(db, source_template_id=copy_id,
                payload=FormTemplateSaveEventCopy(event_id=event_id, fields=[], settings={}),
                actor=organizer, if_match='"1"', idempotency_key=key)
        return await RegistrationFormCommandService.update(db, event=event, actor_user_id=organizer.id,
            payload=RegistrationFormConfigUpdate(settings={}), if_match='"1"', idempotency_key=key)

    async with TenantContextGuard.scoped(db, owner):
        if allowed:
            await write()
        else:
            with pytest.raises(HTTPException) as exc:
                await write()
            assert exc.value.status_code == 409
            assert exc.value.detail == {"code": "EVENT_TEMPLATE_LINEAGE_REPAIR_REQUIRED"}
    async with TenantContextGuard.scoped(db, owner):
        copy = await db.scalar(select(FormTemplate).where(FormTemplate.id == copy_id)
            .execution_options(populate_existing=True))
        if not allowed:
            assert copy.version == 1 and copy.settings == settings
        elif root_kind in {"self", "none"}:
            assert "_source_template_id" not in copy.settings
        else:
            assert copy.settings["_source_template_id"] == str(root_id)
        assert copy.organization_id == owner and copy.settings["_event_id"] == str(event_id)


@pytest.mark.asyncio
async def test_old_valid_foreign_lineage_is_quarantined_in_a_batch(db, event, super_admin, monkeypatch):
    from contextlib import asynccontextmanager
    from app.tasks import catalogue_reconciliation as worker
    foreign = Organization(name="Foreign root", slug=f"foreign-root-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    root = FormTemplate(organization_id=foreign.id, scope_type="ORGANIZATION", name="Foreign root",
        slug=f"foreign-root-{uuid.uuid4().hex}", fields=[], settings={})
    db.add(root)
    await db.flush()
    row = FormTemplate(organization_id=event.organization_id, scope_type="EVENT", name="Legacy valid copy",
        slug=f"legacy-copy-{uuid.uuid4().hex}", fields=[],
        settings={"_event_id": str(event.id), "_source_template_id": str(root.id)})
    db.add(row)
    await db.flush()
    row_id, owner_id, actor_id = row.id, event.organization_id, super_admin.id
    db.add(FormTemplateReconciliation(template_id=row.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="VALID"))
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    first = await worker._process_page(owner_id, actor_id, "FORM_TEMPLATE", None)
    second = await worker._process_page(owner_id, actor_id, "FORM_TEMPLATE", None)
    assert first["blocked"] == second["blocked"] == 1
    async with TenantContextGuard.scoped(db, owner_id):
        row = await db.get(FormTemplate, row_id, populate_existing=True)
        assert row.version == 2
        evidence = await db.scalar(select(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id == row_id,
            FormTemplateReconciliation.template_version == 2))
        assert evidence.details["issues"] == ["LINEAGE_REFERENCE_UNAVAILABLE"]
