"""ASGI catalogue adapters execute real PostgreSQL action/feature decisions.

Only authenticated identity and DB connection supply are overridden. This is
not signed-session, middleware rate/CSRF or migrated runtime-role acceptance.
"""
from datetime import datetime, timezone
import uuid

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import pytest
from sqlalchemy import select

from app.dependencies import get_db, get_current_user
from app.core.tenant_context import TenantContextGuard
from app.modules.identity.models.user import User
from app.models import UserOrganizationMembership
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.routers.form_templates import router
from tests.conftest import activate_event_for_test


@pytest.mark.asyncio
@pytest.mark.parametrize("identifier", ["id", "slug"])
@pytest.mark.parametrize("restriction", ["member", "unentitled_owner", "unaccepted", "platform"])
async def test_global_template_detail_requires_same_action_as_list(db, organization, organizer, super_admin,
        identifier, restriction):
    actor = organizer
    if restriction == "platform":
        actor = super_admin
    if restriction in {"member", "unaccepted"}:
        actor = User(organization_id=organization.id, email=f"catalogue-member-{uuid.uuid4().hex}@example.test",
            first_name="Catalogue", last_name="Member", role="organiser", is_active=True)
        db.add(actor)
        await db.flush()
        db.add(UserOrganizationMembership(organization_id=organization.id, user_id=actor.id,
            org_role="member", accepted_at=datetime.now(timezone.utc) if restriction == "member" else None,
            is_active=True))
    source = FormTemplate(name="Shared catalogue admission fixture", slug=f"route-catalogue-{uuid.uuid4().hex}",
        scope_type="GLOBAL", category_key="registration", fields=[], settings={})
    db.add(source)
    await db.commit()
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def identity():
        return actor

    async def database():
        async with TenantContextGuard.scoped(db, actor.organization_id):
            yield db

    app.dependency_overrides[get_current_user] = identity
    app.dependency_overrides[get_db] = database
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        listing = await client.get("/api/v1/forms/templates")
        expected = 404 if restriction in {"unaccepted", "platform"} else 403
        assert listing.status_code == expected
        detail = await client.get(f"/api/v1/forms/templates/{source.id if identifier == 'id' else source.slug}")
        assert detail.status_code == expected
        assert "fields" not in detail.json() and "settings" not in detail.json()


@pytest.mark.asyncio
@pytest.mark.parametrize("identifier", ["id", "slug"])
async def test_global_template_selected_event_detail_remains_available(db, event, organizer, identifier):
    await activate_event_for_test(db, event)
    source = FormTemplate(name="Selected-event shared source", slug=f"event-route-{uuid.uuid4().hex}",
        scope_type="GLOBAL", category_key="registration", fields=[], settings={})
    db.add(source)
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
        response = await client.get(f"/api/v1/forms/templates/{source.id if identifier == 'id' else source.slug}",
            params={"event_id": str(event.id)})
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        assert response.json()["id"] == str(source.id)
    assert await db.scalar(select(FormTemplate.id).where(FormTemplate.id == source.id)) == source.id
