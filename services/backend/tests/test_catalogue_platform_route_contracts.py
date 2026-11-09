"""Platform HTTP adapters keep real MFA, permissions and mutation commands.

Parsed token/identity and connection suppliers are test inputs. No signed-login,
distributed rate limit, CSRF middleware or runtime-role proof is claimed.
"""
from datetime import datetime, timezone
import uuid

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import pytest
from sqlalchemy import select

from app.config import settings
from app.core.tenant_context import TenantContextGuard
from app.dependencies import TokenData, get_db, get_current_user, get_token_data
from app.modules.identity.models.user import User
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.routers import form_templates, form_categories


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["templates", "categories"])
async def test_platform_catalogue_http_mutation_contract(db, super_admin, monkeypatch, kind):
    monkeypatch.setattr(settings, "ENFORCE_PRIVILEGED_MFA", True)
    actor_id, org_id = super_admin.id, super_admin.organization_id
    token = TokenData(user_id=actor_id, role="super_admin", organization_id=org_id,
        jti=str(uuid.uuid4()), amr=(), auth_time=datetime.now(timezone.utc))
    app = FastAPI()
    module = form_templates if kind == "templates" else form_categories
    app.include_router(module.platform_router, prefix="/api/v1")

    async def identity():
        # A new request reloads persisted identity after any command rollback.
        return await db.scalar(select(User).where(User.id == actor_id).execution_options(populate_existing=True))

    async def parsed_token():
        return token

    async def database():
        async with TenantContextGuard.scoped(db, org_id):
            yield db

    app.dependency_overrides[get_current_user] = identity
    app.dependency_overrides[get_token_data] = parsed_token
    app.dependency_overrides[get_db] = database
    path = f"/api/v1/platform/forms/{kind}"
    payload = {"name": "Platform adapter fixture", "slug": f"platform-adapter-{uuid.uuid4().hex}"}
    if kind == "templates":
        category = FormCategory(name="Registration adapter fixture", slug="registration", is_system=True)
        db.add(category)
        await db.commit()
        payload.update(scope_type="GLOBAL", category_key="registration", category_id=str(category.id),
            fields=[], settings={})
    key = str(uuid.uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        no_mfa = await client.post(path, json=payload, headers={"Idempotency-Key": key})
        assert no_mfa.status_code == 403 and no_mfa.json()["detail"]["code"] == "STEP_UP_REQUIRED"
        token.amr = ("mfa",)
        missing_key = await client.post(path, json=payload)
        assert missing_key.status_code == 428
        created = await client.post(path, json=payload, headers={"Idempotency-Key": key})
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["version"] == 1 and body["organization_id"] is None
        assert created.headers["cache-control"] == "no-store"
        replay = await client.post(path, json=payload, headers={"Idempotency-Key": key})
        assert replay.status_code == 201 and replay.json() == body
        target = f"{path}/{body['id']}"
        method = client.put if kind == "templates" else client.patch
        update_key = str(uuid.uuid4())
        update = {"name": "Updated through the platform adapter"}
        assert (await method(target, json=update, headers={"Idempotency-Key": update_key})).status_code == 428
        assert (await method(target, json=update, headers={"If-Match": '"1"'})).status_code == 428
        headers = {"If-Match": '"1"', "Idempotency-Key": update_key}
        saved = await method(target, json=update, headers=headers)
        assert saved.status_code == 200 and saved.json()["version"] == 2
        assert (await method(target, json=update, headers=headers)).json() == saved.json()
        stale = await method(target, json=update, headers={**headers, "Idempotency-Key": str(uuid.uuid4())})
        assert stale.status_code == 412
        changed = await method(target, json={"name": "Changed retry payload"}, headers=headers)
        assert changed.status_code == 409
        injected = await client.post(path, json={**payload, "organization_id": str(uuid.uuid4())},
            headers={"Idempotency-Key": str(uuid.uuid4())})
        assert injected.status_code == 422
        # Both global resource kinds require the explicit replacement workflow.
        if kind == "templates":
            retirement = await client.delete(target, headers={"If-Match": '"2"', "Idempotency-Key": str(uuid.uuid4())})
            assert retirement.status_code == 409
            assert retirement.json()["detail"]["code"] == "GLOBAL_TEMPLATE_REPLACEMENT_REQUIRED"
        else:
            retirement = await client.patch(target, json={"is_active": False},
                headers={"If-Match": '"2"', "Idempotency-Key": str(uuid.uuid4())})
            assert retirement.status_code == 409
            assert retirement.json()["detail"]["code"] == "GLOBAL_CATEGORY_REPLACEMENT_REQUIRED"
    model = FormTemplate if kind == "templates" else FormCategory
    row = await db.get(model, uuid.UUID(body["id"]), populate_existing=True)
    assert row.version == 2 and row.is_active and row.deleted_at is None
