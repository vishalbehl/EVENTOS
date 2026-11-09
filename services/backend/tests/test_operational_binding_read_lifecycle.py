"""Persisted binding reads must not deliver stale/foreign catalogue hierarchy."""
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import update

from app.core.tenant_context import TenantContextGuard
from app.modules.platform.models.organization import Organization
from app.modules.registration.application.operational_binding_commands import (
    get_operational_binding, get_operational_form_projection,
)
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import EventFormTemplateBinding, FormTemplate


@pytest.mark.asyncio
@pytest.mark.parametrize("purpose", ["SURVEY", "SPEAKER_INTAKE"])
@pytest.mark.parametrize("reader", ["administration", "public"])
@pytest.mark.parametrize("defect", ["retired_parent", "deleted_parent", "foreign_parent", "retired_template",
    "deleted_template", "conflicting_events", "wrong_scope", "wrong_purpose", "malformed_settings",
    "foreign_lineage", "event_lineage", "malformed_lineage", "valid"])
async def test_binding_read_rechecks_complete_live_hierarchy(db, event, purpose, reader, defect):
    foreign = Organization(name="Foreign binding-read fixture", slug=f"binding-read-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    category = FormCategory(organization_id=foreign.id if defect == "foreign_parent" else None,
        name="Reviewed taxonomy", slug=f"taxonomy-{uuid.uuid4().hex}", is_system=True,
        is_active=defect != "retired_parent",
        deleted_at=datetime.now(timezone.utc) if defect == "deleted_parent" else None)
    db.add(category)
    await db.flush()
    settings = {"_event_id": str(event.id)}
    if defect == "conflicting_events":
        settings["event_id"] = str(uuid.uuid4())
    if defect in {"foreign_lineage", "event_lineage"}:
        root = FormTemplate(organization_id=foreign.id if defect == "foreign_lineage" else event.organization_id,
            category_id=category.id, name="Invalid historical root", slug=f"root-{uuid.uuid4().hex}",
            scope_type="ORGANIZATION" if defect == "foreign_lineage" else "EVENT",
            category_key="survey" if purpose == "SURVEY" else "speaker_intake", fields=[], settings={})
        db.add(root)
        await db.flush()
        settings["_source_template_id"] = str(root.id)
    if defect == "malformed_lineage":
        settings["_source_template_id"] = "not-a-uuid"
    template = FormTemplate(organization_id=event.organization_id, category_id=category.id,
        name="Owned operational copy", slug=f"operational-read-{uuid.uuid4().hex}",
        scope_type="ORGANIZATION" if defect == "wrong_scope" else "EVENT",
        category_key="abstract" if defect == "wrong_purpose" else "survey" if purpose == "SURVEY" else "speaker_intake",
        fields=[], settings=["invalid"] if defect == "malformed_settings" else settings,
        is_active=defect != "retired_template",
        deleted_at=datetime.now(timezone.utc) if defect == "deleted_template" else None)
    db.add(template)
    await db.flush()
    binding = EventFormTemplateBinding(organization_id=event.organization_id, event_id=event.id,
        purpose=purpose, template_id=template.id)
    db.add(binding)
    await db.commit()
    call = get_operational_binding if reader == "administration" else get_operational_form_projection
    async with TenantContextGuard.scoped(db, event.organization_id):
        if defect == "valid":
            result = await call(db, event=event, purpose=purpose)
            assert (result.template_id == template.id) if reader == "administration" else result["purpose"] == purpose
        else:
            with pytest.raises(HTTPException) as denied:
                await call(db, event=event, purpose=purpose)
            assert denied.value.status_code == (409 if reader == "administration" else 503)


@pytest.mark.asyncio
@pytest.mark.parametrize("purpose", ["SURVEY", "SPEAKER_INTAKE"])
async def test_only_absent_binding_is_unconfigured(db, event, purpose):
    async with TenantContextGuard.scoped(db, event.organization_id):
        assert await get_operational_form_projection(db, event=event, purpose=purpose) is None
        assert (await get_operational_binding(db, event=event, purpose=purpose)).template_id is None


@pytest.mark.asyncio
@pytest.mark.parametrize("public", [False, True])
async def test_binding_read_does_not_trust_a_warm_parent_identity_map(db, event, public):
    category = FormCategory(organization_id=event.organization_id, name="Warm parent",
        slug=f"warm-{uuid.uuid4().hex}", is_active=True)
    db.add(category)
    await db.flush()
    template = FormTemplate(organization_id=event.organization_id, category_id=category.id,
        name="Warm copy", slug=f"warm-copy-{uuid.uuid4().hex}", scope_type="EVENT", category_key="survey",
        fields=[], settings={"event_id": str(event.id)})
    db.add(template)
    await db.flush()
    db.add(EventFormTemplateBinding(organization_id=event.organization_id, event_id=event.id,
        template_id=template.id, purpose="SURVEY"))
    await db.commit()
    call = get_operational_form_projection if public else get_operational_binding
    async with TenantContextGuard.scoped(db, event.organization_id):
        assert await call(db, event=event, purpose="SURVEY") is not None
        await db.execute(update(FormCategory).where(FormCategory.id == category.id).values(is_active=False)
            .execution_options(synchronize_session=False))
        assert category.is_active is True  # deliberately stale ORM instance
        with pytest.raises(HTTPException) as denied:
            await call(db, event=event, purpose="SURVEY")
        assert denied.value.status_code == (503 if public else 409)


@pytest.mark.asyncio
@pytest.mark.parametrize("public", [False, True])
@pytest.mark.parametrize("key", ["survey", "speaker"])
async def test_retired_owned_lineage_remains_history_not_operational_authority(db, event, public, key):
    root = FormTemplate(organization_id=event.organization_id, name="Retired historical root",
        slug=f"retired-{uuid.uuid4().hex}", scope_type="ORGANIZATION", category_key=key,
        fields=[], settings={}, is_active=False, deleted_at=datetime.now(timezone.utc))
    db.add(root)
    await db.flush()
    template = FormTemplate(organization_id=event.organization_id, name="Active owned copy",
        slug=f"history-copy-{uuid.uuid4().hex}", scope_type="EVENT", category_key=key,
        fields=[], settings={"event_id": str(event.id), "_source_template_id": str(root.id)})
    db.add(template)
    await db.flush()
    purpose = "SURVEY" if key == "survey" else "SPEAKER_INTAKE"
    db.add(EventFormTemplateBinding(organization_id=event.organization_id, event_id=event.id,
        template_id=template.id, purpose=purpose))
    await db.commit()
    async with TenantContextGuard.scoped(db, event.organization_id):
        result = await (get_operational_form_projection(db, event=event, purpose=purpose) if public
            else get_operational_binding(db, event=event, purpose=purpose))
        assert result is not None
        if public:
            assert "_source_template_id" not in result["settings"] and "event_id" not in result["settings"]
        assert template.settings["_source_template_id"] == str(root.id)


@pytest.mark.asyncio
@pytest.mark.parametrize("state", ["absent", "valid", "retired_parent", "retired_owned_lineage"])
async def test_public_http_binding_distinguishes_absence_and_unavailable_configuration(client, db, event, state):
    event.status = "active"
    if state != "absent":
        category = FormCategory(organization_id=event.organization_id, name="HTTP taxonomy",
            slug=f"http-taxonomy-{uuid.uuid4().hex}", is_active=state != "retired_parent")
        db.add(category)
        await db.flush()
        metadata = {"_event_id": str(event.id)}
        if state == "retired_owned_lineage":
            root = FormTemplate(organization_id=event.organization_id, name="Private retired root name",
                slug=f"http-root-{uuid.uuid4().hex}", scope_type="ORGANIZATION", category_key="survey",
                fields=[], settings={}, is_active=False, deleted_at=datetime.now(timezone.utc))
            db.add(root)
            await db.flush()
            metadata["_source_template_id"] = str(root.id)
        template = FormTemplate(organization_id=event.organization_id, name="Public survey",
            slug=f"http-copy-{uuid.uuid4().hex}", scope_type="EVENT", category_id=category.id,
            category_key="survey", fields=[], settings=metadata)
        db.add(template)
        await db.flush()
        db.add(EventFormTemplateBinding(organization_id=event.organization_id, event_id=event.id,
            template_id=template.id, purpose="SURVEY"))
    await db.commit()
    response = await client.get(f"/api/v1/public/events/{event.id}/operational-forms/SURVEY")
    assert response.status_code == (404 if state == "absent" else 503 if state == "retired_parent" else 200)
    assert "Private retired root name" not in response.text
    if response.status_code == 200:
        assert "_source_template_id" not in response.json()["settings"]
        assert "_event_id" not in response.json()["settings"]
