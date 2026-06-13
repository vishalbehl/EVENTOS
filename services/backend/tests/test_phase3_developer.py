# tests/test_phase3_developer.py
from __future__ import annotations

import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models.user import User
from app.modules.developer.models.developer_registry import ApiKey, OAuthClient, RateLimit
from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionPlan
from app.modules.developer.models.developer_domain_tables import DeveloperOAuthToken
from app.redis import redis_client
from tests.conftest import auth_headers



@pytest.mark.asyncio
async def test_developer_api_key_lifecycle(client: AsyncClient, organizer: User, db: AsyncSession):
    # 1. Create API Key
    payload = {
        "name": "Pipeline Integration",
        "expires_in_days": 30
    }
    resp = await client.post(
        "/developer/api-keys",
        json=payload,
        headers=auth_headers(organizer)
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

    # 3. Authenticate with the API Key
    # We can hit a non-public route (like /developer/api-keys) to verify auth
    # Using X-API-Key header
    auth_resp = await client.get(
        "/developer/api-keys",
        headers={"X-API-Key": plaintext_key}
    )
    assert auth_resp.status_code == 200

    # Using Authorization Bearer key header
    auth_resp2 = await client.get(
        "/developer/api-keys",
        headers={"Authorization": f"Bearer {plaintext_key}"}
    )
    assert auth_resp2.status_code == 200

    # 4. Revoke API Key
    del_resp = await client.delete(
        f"/developer/api-keys/{key_id}",
        headers=auth_headers(organizer)
    )
    assert del_resp.status_code == 204

    # 5. Verify revoked key is rejected
    fail_resp = await client.get(
        "/developer/api-keys",
        headers={"X-API-Key": plaintext_key}
    )
    assert fail_resp.status_code == 401

@pytest.mark.asyncio
async def test_oauth_client_and_authorize_flow(client: AsyncClient, organizer: User, db: AsyncSession):
    # 1. Register OAuth Client
    payload = {
        "name": "Mobile Dashboard Client",
        "redirect_uris": ["https://localhost:3000/callback"]
    }
    resp = await client.post(
        "/developer/oauth/clients",
        json=payload,
        headers=auth_headers(organizer)
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "client_id" in data
    assert "plaintext_client_secret" in data
    client_id = data["client_id"]
    client_secret = data["plaintext_client_secret"]
    app_id = data["id"]

    # 2. Get list of clients
    list_resp = await client.get(
        "/developer/oauth/clients",
        headers=auth_headers(organizer)
    )
    assert list_resp.status_code == 200
    assert any(c["id"] == app_id for c in list_resp.json())

    # 3. Request Authorization Code
    auth_resp = await client.post(
        f"/developer/oauth/authorize?client_id={client_id}&redirect_uri=https://localhost:3000/callback&response_type=code",
        headers=auth_headers(organizer)
    )
    assert auth_resp.status_code == 200
    auth_data = auth_resp.json()
    assert "code" in auth_data
    auth_code = auth_data["code"]

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
        headers=auth_headers(organizer)
    )
    assert del_resp.status_code == 204

@pytest.mark.asyncio
async def test_developer_rate_limiting(client: AsyncClient, organizer: User, db: AsyncSession):
    # Setup test database plan limits
    plan = SubscriptionPlan(name="TestTier", max_events=5, max_users=5)
    db.add(plan)
    await db.flush()
    
    sub = OrganizationSubscription(organization_id=organizer.organization_id, plan_id=plan.id, status="ACTIVE")
    db.add(sub)
    
    # Set limit to 2 requests per minute to easily trigger rate limiting
    lim = RateLimit(plan_tier="TestTier", requests_per_minute=2, requests_per_day=50)
    db.add(lim)
    await db.commit()

    # Create developer API key
    key_resp = await client.post(
        "/developer/api-keys",
        json={"name": "Limiter Key"},
        headers=auth_headers(organizer)
    )
    key_data = key_resp.json()
    plaintext_key = key_data["plaintext_key"]

    # Clear Redis rate limit keys to start clean
    min_key_pattern = f"rate:dev:min:{organizer.organization_id}:*"
    keys = await redis_client.keys(min_key_pattern)
    for k in keys:
        await redis_client.delete(k)
        
    await redis_client.delete(f"rl:{organizer.organization_id}:minute")
    await redis_client.delete(f"rl:{organizer.organization_id}:day")
        
    config_key = f"rate:limit:config:{organizer.organization_id}"
    await redis_client.delete(config_key)


    # Trigger requests using the API key
    # First request: Allowed
    resp1 = await client.get("/developer/api-keys", headers={"X-API-Key": plaintext_key})
    assert resp1.status_code == 200

    # Second request: Allowed
    resp2 = await client.get("/developer/api-keys", headers={"X-API-Key": plaintext_key})
    assert resp2.status_code == 200

    # Third request: Blocked with 429
    resp3 = await client.get("/developer/api-keys", headers={"X-API-Key": plaintext_key})
    assert resp3.status_code == 429
    assert resp3.json()["detail"] == "Rate limit exceeded. Too many requests."
