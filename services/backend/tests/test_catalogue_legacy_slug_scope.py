"""Legacy selectors must be unique within the requested operational scope."""
import uuid

from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
import pytest

from app.core.tenant_context import TenantContextGuard
from app.dependencies import get_db, get_current_user
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.application.queries import FormBuilderQueryService
from app.modules.registration.routers.form_templates import router
from tests.conftest import activate_event_for_test


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["exact_and_legacy", "global_and_owned", "retired", "wrong_event", "conflicting_event"])
async def test_customer_legacy_slug_never_picks_an_arbitrary_or_unavailable_source(db, event, organizer, case):
    await activate_event_for_test(db, event)
    slug = f"legacy-source-{uuid.uuid4().hex}"
    requested = f"tpl_{slug.replace('-', '_')}" if case == "exact_and_legacy" else slug
    source = FormTemplate(organization_id=event.organization_id if case in {"wrong_event", "conflicting_event"} else None,
        scope_type="EVENT" if case in {"wrong_event", "conflicting_event"} else "GLOBAL",
        name="Legacy selector fixture", slug=slug, category_key="registration", fields=[],
        settings={"_event_id": str(uuid.uuid4())} if case == "wrong_event" else
            {"_event_id": str(event.id), "event_id": str(uuid.uuid4())} if case == "conflicting_event" else {},
        is_active=case != "retired")
    db.add(source)
    if case in {"exact_and_legacy", "global_and_owned"}:
        db.add(FormTemplate(organization_id=event.organization_id if case == "global_and_owned" else None,
            scope_type="ORGANIZATION" if case == "global_and_owned" else "GLOBAL",
            name="Other legitimate selector match", slug=requested, category_key="registration", fields=[], settings={}))
    await db.commit()
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def identity():
        return organizer

    async def database():
        async with TenantContextGuard.scoped(db, event.organization_id):
            yield db

    app.dependency_overrides[get_current_user] = identity
    app.dependency_overrides[get_db] = database
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        result = await client.get(f"/api/v1/forms/templates/{requested}", params={"event_id": str(event.id)})
        assert result.status_code == (409 if case in {"exact_and_legacy", "global_and_owned"} else 404)
        if result.status_code == 409:
            assert result.json()["detail"]["code"] == "AMBIGUOUS_FORM_TEMPLATE"
        assert "fields" not in result.json() and "settings" not in result.json()


@pytest.mark.asyncio
async def test_owned_mutation_scope_and_inactive_history_are_explicit(db, organization):
    slug = f"scoped-mutation-{uuid.uuid4().hex}"
    global_row = FormTemplate(name="Global selector", slug=slug, scope_type="GLOBAL", fields=[], settings={})
    owned_row = FormTemplate(name="Owned selector", slug=slug, scope_type="ORGANIZATION",
        organization_id=organization.id, fields=[], settings={})
    db.add_all([global_row, owned_row])
    await db.commit()
    owned_id, global_id, owner_id = owned_row.id, global_row.id, organization.id
    async with TenantContextGuard.scoped(db, owner_id):
        reader = FormBuilderQueryService(db)
        with pytest.raises(HTTPException) as ambiguous:
            await reader.get_template_by_slug(slug=slug, organization_id=owner_id)
        assert ambiguous.value.status_code == 409
        # The update/delete adapters explicitly request only their mutation domain.
        selected = await reader.get_template_by_slug(slug=slug, organization_id=owner_id,
            scope_types=("ORGANIZATION",), include_inactive=True)
        assert selected.id == owned_id and selected.id != global_id
        selected.is_active = False
        await db.commit()
        assert await reader.get_template_by_slug(slug=slug, organization_id=owner_id,
            scope_types=("ORGANIZATION",)) is None
        assert (await reader.get_template_by_slug(slug=slug, organization_id=owner_id,
            scope_types=("ORGANIZATION",), include_inactive=True)).id == owned_id


@pytest.mark.asyncio
@pytest.mark.parametrize("context", [None, "foreign"])
async def test_legacy_lookup_requires_matching_verified_context(db, organization, context):
    from app.core.tenant_context import TenantContextRequired
    from app.database import tenant_org_id
    token = tenant_org_id.set(None if context is None else uuid.uuid4())
    try:
        with pytest.raises(TenantContextRequired):
            await FormBuilderQueryService(db).get_template_by_slug(slug="known-source",
                organization_id=organization.id)
    finally:
        tenant_org_id.reset(token)
