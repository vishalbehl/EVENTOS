"""Public root discovery never weakens ordinary forced-RLS event access."""
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import select, text

from app.database import tenant_org_id
from app.modules.events.models.event import Event
from app.modules.registration.routers.registration_portal import _public_form_event
from app.modules.registration.services.public_form_context import public_form_scope
from app.core.tenant_context import TenantContextGuard


@pytest.mark.asyncio
async def test_discovery_missing_execute_permission_fails_unavailable_without_bypass(db, event):
    role = "public_form_denied_" + uuid.uuid4().hex
    await db.execute(text(f'CREATE ROLE "{role}" NOSUPERUSER NOBYPASSRLS NOLOGIN'))
    await db.execute(text(f'GRANT USAGE ON SCHEMA registration TO "{role}"'))
    await db.commit()
    event_id = event.id
    before = tenant_org_id.get()
    try:
        await db.execute(text(f'SET LOCAL ROLE "{role}"'))
        with pytest.raises(HTTPException) as denied:
            async with public_form_scope(db, event_id):
                pytest.fail("Missing discovery permission obtained a scope")
        assert denied.value.status_code == 503
        assert denied.value.detail["code"] == "PUBLIC_DISCOVERY_UNAVAILABLE"
        assert tenant_org_id.get() == before
        assert await db.scalar(text("SELECT 1")) == 1
    finally:
        await db.rollback()
        await db.execute(text("RESET ROLE"))


@pytest.mark.asyncio
async def test_unknown_public_event_is_concealed(db):
    with pytest.raises(HTTPException) as denied:
        async with public_form_scope(db, uuid.uuid4()):
            pytest.fail("Unknown event obtained a scope")
    assert denied.value.status_code == 404


@pytest.mark.parametrize("unsafe", [
    {"security_definer": False}, {"uuid_result": False}, {"stable": False}, {"returns_set": True},
    {"definer_can_bypass_rls": False}, {"runtime_can_execute": False},
    {"runtime_can_assume_definer": True}, {"public_can_execute": True},
    {"runtime_can_create_schema_objects": True},
    {"fixed_settings": ["search_path=public", "row_security=off"]},
    {"fixed_settings": None},
])
def test_preflight_rejects_unsafe_public_discovery_metadata(unsafe):
    from ops.category_a_preflight import public_discovery_is_safe
    safe = {"security_definer": True, "uuid_result": True, "returns_set": False, "stable": True,
        "definer_can_bypass_rls": True, "runtime_can_execute": True,
        "runtime_can_assume_definer": False, "public_can_execute": False,
        "runtime_can_create_schema_objects": False,
        "fixed_settings": ["search_path=pg_catalog", "row_security=off"]}
    assert public_discovery_is_safe(safe)
    assert not public_discovery_is_safe({**safe, **unsafe})


@pytest.mark.asyncio
@pytest.mark.parametrize("inherited", [None, "foreign"])
@pytest.mark.parametrize("finish", ["commit", "rollback", "error"])
async def test_public_discovery_under_runtime_role_resets_both_contexts(db, event, inherited, finish):
    event.status = "active"
    await db.commit()
    event_id, owner_id = event.id, event.organization_id
    role = "public_form_probe_" + uuid.uuid4().hex
    await db.execute(text(f'CREATE ROLE "{role}" NOSUPERUSER NOBYPASSRLS NOLOGIN'))
    await db.execute(text(f'GRANT USAGE ON SCHEMA registration, events, platform, design TO "{role}"'))
    await db.execute(text(f'GRANT SELECT ON events.events, platform.organizations, design.portal_theme_settings TO "{role}"'))
    assert not await db.scalar(text("SELECT has_function_privilege(:role,'registration.public_form_owner_v1(uuid)','EXECUTE')"),
        {"role": role})
    await db.execute(text(f'GRANT EXECUTE ON FUNCTION registration.public_form_owner_v1(uuid) TO "{role}"'))
    await db.execute(text("ALTER TABLE events.events ENABLE ROW LEVEL SECURITY"))
    await db.execute(text("ALTER TABLE events.events FORCE ROW LEVEL SECURITY"))
    await db.execute(text("""CREATE POLICY public_probe_event_isolation ON events.events
        USING (organization_id=nullif(current_setting('app.current_organization_id',true),'')::uuid)
        WITH CHECK (organization_id=nullif(current_setting('app.current_organization_id',true),'')::uuid)"""))
    await db.commit()
    previous = uuid.uuid4() if inherited else None
    token = tenant_org_id.set(previous)
    try:
        await db.execute(text(f'SET LOCAL ROLE "{role}"'))
        await TenantContextGuard.apply(db, previous)
        assert not (await db.scalars(select(Event.__table__.c.id))).all()
        with pytest.raises(HTTPException) as hidden:
            await _public_form_event(db, event_id)
        assert hidden.value.status_code == 404
        try:
            async with public_form_scope(db, event_id):
                assert tenant_org_id.get() == owner_id
                assert (await _public_form_event(db, event_id)).id == event_id
                if finish == "error":
                    raise ValueError("Injected handler failure")
                await getattr(db, finish)()
                if finish == "rollback":
                    # The fixture is an admin connection using SET LOCAL ROLE;
                    # savepoint rollback restores that admin role. A real
                    # runtime login does not change identity on rollback.
                    await db.execute(text(f'SET LOCAL ROLE "{role}"'))
                assert (await _public_form_event(db, event_id)).id == event_id
        except ValueError:
            assert finish == "error"
        assert tenant_org_id.get() == previous
        assert await db.scalar(text("SELECT current_setting('app.current_organization_id',true)")) == (str(previous) if previous else "")
        assert not (await db.scalars(select(Event.__table__.c.id))).all()
    finally:
        await db.rollback()
        await db.execute(text("RESET ROLE"))
        tenant_org_id.reset(token)


@pytest.mark.asyncio
@pytest.mark.parametrize("restricted", ["draft", "deleted", "suspended", "archived", "platform"])
async def test_public_discovery_conceals_unavailable_or_platform_event(db, event, organization, restricted):
    event.status = "active"
    if restricted == "draft":
        event.status = "draft"
    elif restricted == "deleted":
        event.deleted_at = datetime.now(timezone.utc)
    elif restricted == "suspended":
        organization.suspended_at = datetime.now(timezone.utc)
    elif restricted == "archived":
        organization.archived_at = datetime.now(timezone.utc)
        organization.is_active = False
    else:
        organization.is_platform_org = True
    await db.commit()
    with pytest.raises(HTTPException) as denied:
        async with public_form_scope(db, event.id):
            pytest.fail("Unavailable event obtained a public scope")
    assert denied.value.status_code == 404


@pytest.mark.asyncio
async def test_public_http_scope_does_not_authorize_customer_endpoints(client, db, event):
    from tests.conftest import activate_event_for_test
    await activate_event_for_test(db, event)
    event.status = "active"
    await db.commit()
    before = tenant_org_id.get()
    public = await client.get(f"/api/v1/portal/registration/{event.id}/form",
        headers={"X-Organization-ID": str(uuid.uuid4())})
    assert public.status_code == 200, public.text
    assert public.json()["event_name"] == event.name
    protected = await client.get(f"/api/v1/organizations/{event.organization_id}/workspaces")
    assert protected.status_code in {401, 403}
    assert tenant_org_id.get() == before
    from app.modules.platform.models.organization import Organization
    owner = await db.get(Organization, event.organization_id)
    owner.suspended_at = datetime.now(timezone.utc)
    await db.commit()
    # Lifecycle checks precede a warm public-form cache.
    assert (await client.get(f"/api/v1/portal/registration/{event.id}/form")).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("lineage", [{}, {"_event_id": "foreign"}])
async def test_public_operational_binding_rejects_missing_or_foreign_event_lineage(client, db, event, lineage):
    from app.modules.registration.models.form_template import FormTemplate, EventFormTemplateBinding
    event.status = "active"
    template = FormTemplate(organization_id=event.organization_id, name="Private incorrect binding",
        slug=f"wrong-lineage-{uuid.uuid4().hex}", category_key="survey", scope_type="EVENT",
        fields=[], settings={"_event_id": str(uuid.uuid4())} if lineage else {})
    db.add(template)
    await db.flush()
    db.add(EventFormTemplateBinding(organization_id=event.organization_id,
        event_id=event.id, purpose="SURVEY", template_id=template.id))
    await db.commit()
    response = await client.get(f"/api/v1/public/events/{event.id}/operational-forms/SURVEY")
    assert response.status_code == 503
    assert "Private incorrect binding" not in response.text
