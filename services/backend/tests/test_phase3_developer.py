# tests/test_phase3_developer.py
from __future__ import annotations

import uuid
import json
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.developer.models.developer_registry import ApiKey, OAuthClient, RateLimit
from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionPlan
from app.modules.developer.models.developer_domain_tables import DeveloperOAuthToken
from app.modules.integrations.models.integrations_domain_tables import IntegrationProvider
from app.redis import redis_client
from tests.conftest import auth_headers, activate_event_for_test



@pytest.mark.asyncio
async def test_developer_api_key_lifecycle(client: AsyncClient, organizer: User, event: Event, db: AsyncSession):
    await activate_event_for_test(db, event)
    # 1. Create API Key
    payload = {
        "name": "Pipeline Integration",
        "expires_in_days": 30
    }
    resp = await client.post(
        "/developer/api-keys",
        json=payload,
        headers={**auth_headers(organizer), "Idempotency-Key": "developer-key-pipeline-create"}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "plaintext_key" in data
    assert data["name"] == "Pipeline Integration"
    assert data["prefix"] == "evx_live"
    plaintext_key = data["plaintext_key"]
    key_id = data["id"]

    # 2. List API Keys
    list_resp = await client.get(
        "/developer/api-keys",
        headers=auth_headers(organizer)
    )
    assert list_resp.status_code == 200
    keys = list_resp.json()
    assert any(k["id"] == key_id for k in keys)

    # 3. Authenticate with the API key on a machine-authorized endpoint.
    auth_resp = await client.get(
        "/developer/service-identity",
        headers={"X-API-Key": plaintext_key}
    )
    assert auth_resp.status_code == 200
    assert auth_resp.json()["organization_id"] == str(organizer.organization_id)

    # API keys cannot impersonate users to manage credentials.
    management_resp = await client.get(
        "/developer/api-keys",
        headers={"X-API-Key": plaintext_key},
    )
    assert management_resp.status_code == 403

    # Authorization Bearer also supports the machine endpoint.
    auth_resp2 = await client.get(
        "/developer/service-identity",
        headers={"Authorization": f"Bearer {plaintext_key}"}
    )
    assert auth_resp2.status_code == 200

    # 4. Revoke API Key
    del_resp = await client.delete(
        f"/developer/api-keys/{key_id}",
        headers={**auth_headers(organizer), "Idempotency-Key": "developer-key-pipeline-revoke"}
    )
    assert del_resp.status_code == 204

    # 5. Verify revoked key is rejected
    fail_resp = await client.get(
        "/developer/service-identity",
        headers={"X-API-Key": plaintext_key}
    )
    assert fail_resp.status_code == 401


@pytest.mark.asyncio
async def test_integration_connection_lifecycle_is_versioned_and_idempotent(
    client: AsyncClient, organizer: User, event: Event, db: AsyncSession
):
    await activate_event_for_test(db, event)
    provider = IntegrationProvider(name=f"Test Provider {uuid.uuid4().hex[:8]}", description="Test-only provider")
    db.add(provider)
    await db.commit()
    await db.refresh(provider)

    providers = await client.get("/developer/integration-providers", headers=auth_headers(organizer))
    assert providers.status_code == 200
    assert any(row["id"] == str(provider.id) for row in providers.json())

    create_headers = {**auth_headers(organizer), "Idempotency-Key": f"integration-create-{uuid.uuid4()}"}
    created = await client.post(
        "/developer/integration-connections",
        json={"provider_id": str(provider.id)},
        headers=create_headers,
    )
    assert created.status_code == 201
    connection = created.json()
    assert connection["is_active"] is True
    assert connection["version"] == 1

    replay = await client.post(
        "/developer/integration-connections",
        json={"provider_id": str(provider.id)},
        headers=create_headers,
    )
    assert replay.status_code == 201
    assert replay.json() == connection

    updated = await client.patch(
        f"/developer/integration-connections/{connection['id']}",
        json={"is_active": False},
        headers={
            **auth_headers(organizer),
            "Idempotency-Key": f"integration-update-{uuid.uuid4()}",
            "If-Match": "1",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["is_active"] is False
    assert updated.json()["version"] == 2

    stale = await client.patch(
        f"/developer/integration-connections/{connection['id']}",
        json={"is_active": True},
        headers={
            **auth_headers(organizer),
            "Idempotency-Key": f"integration-stale-{uuid.uuid4()}",
            "If-Match": "1",
        },
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "VERSION_CONFLICT"

@pytest.mark.asyncio
async def test_oauth_client_and_authorize_flow(client: AsyncClient, organizer: User, event: Event, db: AsyncSession):
    await activate_event_for_test(db, event)
    # 1. Register OAuth Client
    payload = {
        "name": "Mobile Dashboard Client",
        "redirect_uris": ["https://localhost:3000/callback"]
    }
    create_key = f"oauth-client-{uuid.uuid4()}"
    resp = await client.post(
        "/developer/oauth/clients",
        json=payload,
        headers={**auth_headers(organizer), "Idempotency-Key": create_key}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "client_id" in data
    assert "plaintext_client_secret" in data
    client_id = data["client_id"]
    client_secret = data["plaintext_client_secret"]
    app_id = data["id"]
    assert data["version"] == 1

    secret_replay = await client.post(
        "/developer/oauth/clients",
        json=payload,
        headers={**auth_headers(organizer), "Idempotency-Key": create_key},
    )
    assert secret_replay.status_code == 409
    assert secret_replay.json()["detail"]["code"] == "IDEMPOTENCY_RESULT_NO_LONGER_REPLAYABLE"

    # 2. Get list of clients
    list_resp = await client.get(
        "/developer/oauth/clients",
        headers=auth_headers(organizer)
    )
    assert list_resp.status_code == 200
    assert any(c["id"] == app_id for c in list_resp.json())

    # 3. Request Authorization Code
    authorization_key = f"oauth-authorization-{uuid.uuid4()}"
    auth_resp = await client.post(
        f"/developer/oauth/authorize?client_id={client_id}&redirect_uri=https://localhost:3000/callback&response_type=code",
        headers={**auth_headers(organizer), "Idempotency-Key": authorization_key}
    )
    assert auth_resp.status_code == 200
    auth_data = auth_resp.json()
    assert "code" in auth_data
    auth_code = auth_data["code"]
    auth_replay = await client.post(
        f"/developer/oauth/authorize?client_id={client_id}&redirect_uri=https://localhost:3000/callback&response_type=code",
        headers={**auth_headers(organizer), "Idempotency-Key": authorization_key},
    )
    assert auth_replay.status_code == 200
    assert auth_replay.json()["code"] == auth_code

    # 4. Exchange Auth Code for Access Token
    token_payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": auth_code,
        "grant_type": "authorization_code",
        "redirect_uri": "https://localhost:3000/callback"
    }
    token_resp = await client.post(
        "/developer/oauth/token",
        data=token_payload
    )
    assert token_resp.status_code == 200
    token_data = token_resp.json()
    assert "access_token" in token_data
    access_token = token_data["access_token"]

    # 5. Authenticate via OAuth Access Token
    oauth_auth_resp = await client.get(
        "/developer/api-keys",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert oauth_auth_resp.status_code == 200

    # Clean up OAuth client
    del_resp = await client.delete(
        f"/developer/oauth/clients/{app_id}",
        headers={
            **auth_headers(organizer),
            "Idempotency-Key": f"oauth-revoke-{uuid.uuid4()}",
            "If-Match": "1",
        }
    )
    assert del_resp.status_code == 204

@pytest.mark.asyncio
async def test_developer_rate_limiting(client: AsyncClient, organizer: User, event: Event, db: AsyncSession):
    await activate_event_for_test(db, event)
    sub = await db.scalar(
        select(OrganizationSubscription).where(
            OrganizationSubscription.organization_id == organizer.organization_id,
            OrganizationSubscription.status == "ACTIVE",
        )
    )
    plan = await db.get(SubscriptionPlan, sub.plan_id)
    
    # Set limit to 2 requests per minute to easily trigger rate limiting
    lim = RateLimit(plan_tier=plan.name, requests_per_minute=2, requests_per_day=50)
    db.add(lim)
    await db.commit()

    # Create developer API key
    key_resp = await client.post(
        "/developer/api-keys",
        json={"name": "Limiter Key"},
        headers={**auth_headers(organizer), "Idempotency-Key": "developer-key-limiter-create"}
    )
    key_data = key_resp.json()
    plaintext_key = key_data["plaintext_key"]

    from app.core.cache_keys import TenantCacheKey

    # Clear Redis rate limit keys to start clean
    min_key_pattern = f"cache:v1:tenant:{organizer.organization_id}:rate-limit:developer:minute:*"
    keys = await redis_client.keys(min_key_pattern)
    for k in keys:
        await redis_client.delete(k)
        
    await redis_client.delete(f"rl:{organizer.organization_id}:minute")
    await redis_client.delete(f"rl:{organizer.organization_id}:day")
    await redis_client.delete(TenantCacheKey.rate_limit_window(organizer.organization_id, "minute"))
    await redis_client.delete(TenantCacheKey.rate_limit_window(organizer.organization_id, "day"))
        
    config_key = TenantCacheKey.rate_limit_config(organizer.organization_id)
    await redis_client.delete(config_key)
    await redis_client.setex(config_key, 300, json.dumps({"minute": 2, "day": 50}))


    # Trigger requests using the API key
    # First request: Allowed
    resp1 = await client.get("/developer/service-identity", headers={"X-API-Key": plaintext_key})
    assert resp1.status_code == 200

    # Second request: Allowed
    resp2 = await client.get("/developer/service-identity", headers={"X-API-Key": plaintext_key})
    assert resp2.status_code == 200

    # Third request: Blocked with 429
    resp3 = await client.get("/developer/service-identity", headers={"X-API-Key": plaintext_key})
    assert resp3.status_code == 429
    assert resp3.json()["detail"] == "Rate limit exceeded. Too many requests."
def test_standard_service_facades_expose_idempotency_and_concurrency_contracts():
    from app.core.concurrency import ConcurrencyService
    from app.core.idempotency_service import IdempotencyService

    assert callable(IdempotencyService.begin)
    assert callable(IdempotencyService.complete)
    assert callable(IdempotencyService.replay)
    assert callable(IdempotencyService.purge_expired)
    assert callable(ConcurrencyService.require_if_match)
    assert callable(ConcurrencyService.raise_conflict)
    assert callable(ConcurrencyService.update)
