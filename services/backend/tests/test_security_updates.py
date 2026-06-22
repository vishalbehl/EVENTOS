import pytest
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Request
from httpx import AsyncClient
from sqlalchemy import select

from app.core.encryption import encrypt, decrypt
from app.modules.identity.models.user import User
from app.modules.identity.services.auth_service import create_access_token
from app.modules.registration.models.registration_theme_setting import RegistrationThemeSetting
from app.modules.audit.models.audit_domain_tables import ImpersonationLog
from app.middleware.ip_allowlist import IPAllowlistMiddleware


def test_encryption_utility():
    plain = "my_super_secret_totp_seed_12345"
    encrypted = encrypt(plain)
    
    assert encrypted.startswith("v1:")
    assert encrypted != plain
    
    decrypted = decrypt(encrypted)
    assert decrypted == plain

    # Falsy values
    assert encrypt("") == ""
    assert decrypt("") == ""

    # Invalid cipher
    with pytest.raises(ValueError):
        decrypt("v1:invalidbase64ciphertext")


@pytest.mark.asyncio
async def test_stripe_credentials_validator(db):
    # Setup test theme setting
    from app.modules.events.models.event import Event
    from app.modules.platform.models.organization import Organization
    
    org = Organization(name="Test Org Security", slug="test-org-sec")
    db.add(org)
    await db.flush()

    event = Event(
        organization_id=org.id,
        name="Security Test Event",
        short_code="SECTEST",
        start_date=datetime.now(timezone.utc).date(),
        end_date=datetime.now(timezone.utc).date() + timedelta(days=1),
        timezone="Asia/Kolkata",
    )
    db.add(event)
    await db.flush()

    # 1. Plaintext secret key write should be rejected
    setting = event.registration_theme_setting
    with pytest.raises(ValueError) as excinfo:
        setting.stripe_credentials = {
            "publishable_key": "pk_test_123",
            "secret_key": "sk_test_123" # Plaintext sk_ key
        }
    assert "Plaintext secret keys (sk_) are not allowed" in str(excinfo.value)
    
    # 2. Encrypted secret key should be allowed
    setting.stripe_credentials = {
        "publishable_key": "pk_test_123",
        "secret_key": encrypt("sk_test_123")
    }
    await db.flush()


@pytest.mark.asyncio
async def test_ip_allowlist_middleware_enforcement(db):
    # Test middleware behavior
    app = FastAPI()
    
    # Simple dependency-like dummy endpoint
    @app.get("/test-route")
    def dummy_route(request: Request):
        return {"ok": True}

    class MockAuthMiddleware:
        def __init__(self, app):
            self.app = app
        async def __call__(self, scope, receive, send):
            if scope["type"] == "http":
                request = Request(scope)
                user_id_str = request.query_params.get("user_id")
                val = uuid.UUID(user_id_str) if user_id_str else None
                if "state" not in scope:
                    scope["state"] = {}
                scope["state"]["user_id"] = val
            await self.app(scope, receive, send)

    app.add_middleware(IPAllowlistMiddleware)
    app.add_middleware(MockAuthMiddleware)

    import app.middleware.ip_allowlist as ip_allowlist_mod
    class TestSessionWrapper:
        def __init__(self, session):
            self.session = session
        async def __aenter__(self):
            return self.session
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    original_sessionmaker = ip_allowlist_mod.AsyncSessionLocal
    ip_allowlist_mod.AsyncSessionLocal = lambda: TestSessionWrapper(db)

    try:
        from httpx import ASGITransport
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Public route should skip check (dummy app returns 404 since health is not registered on dummy app)
            res = await client.get("/health")
            assert res.status_code == 404 

            # 2. Unauthenticated request should skip IP check (dummy app returns 200 OK)
            res = await client.get("/test-route")
            assert res.status_code == 200

            # 3. Create test users with IP allowlists
            from app.modules.platform.models.organization import Organization
            org = Organization(name="Test Org Sec IP", slug="test-org-sec-ip")
            db.add(org)
            await db.flush()

            user_allowed = User(
                organization_id=org.id,
                email="allowed_ip@test.com",
                first_name="IP",
                last_name="Allowed",
                role="organizer",
                allowed_ips="127.0.0.1, 192.168.1.0/24",
            )
            user_blocked = User(
                organization_id=org.id,
                email="blocked_ip@test.com",
                first_name="IP",
                last_name="Blocked",
                role="organizer",
                allowed_ips="10.0.0.1",
            )
            db.add_all([user_allowed, user_blocked])
            await db.flush()

            # 4. Authenticated request from allowed IP
            res = await client.get(f"/test-route?user_id={user_allowed.id}")
            assert res.status_code == 200

            # 5. Authenticated request from blocked IP
            res = await client.get(f"/test-route?user_id={user_blocked.id}")
            assert res.status_code == 403
            assert res.json()["detail"] == "IP address access denied."
    finally:
        ip_allowlist_mod.AsyncSessionLocal = original_sessionmaker


@pytest.mark.asyncio
async def test_impersonation_logs_endpoints(db, client):
    # Setup test users and data
    from app.modules.platform.models.organization import Organization
    org = Organization(name="Impersonate Org", slug="imp-org")
    db.add(org)
    await db.flush()

    super_admin = User(
        organization_id=org.id,
        email="superadmin@test.com",
        first_name="Super",
        last_name="Admin",
        role="super_admin",
        platform_role="SUPER_ADMIN",
    )
    target_user = User(
        organization_id=org.id,
        email="target@test.com",
        first_name="Target",
        last_name="User",
        role="organizer",
    )
    db.add_all([super_admin, target_user])
    await db.commit()

    # Generate token for Super Admin
    from app.modules.identity.services.auth_service import create_access_token
    token = create_access_token(super_admin)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Start impersonation
    payload = {"reason": "Debugging a billing issue"}
    res = await client.post(
        f"/api/v1/platform/impersonate/{target_user.id}",
        json=payload,
        headers=headers
    )
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert "session_id" in data
    session_id = data["session_id"]

    # Verify log row is created
    log = await db.get(ImpersonationLog, uuid.UUID(session_id))
    assert log is not None
    assert log.super_admin_id == super_admin.id
    assert log.target_user_id == target_user.id
    assert log.reason == "Debugging a billing issue"
    assert log.session_token_hash is not None
    assert log.terminated_at is None

    # 2. Get impersonation logs
    res = await client.get("/api/v1/platform/impersonation-logs", headers=headers)
    assert res.status_code == 200
    logs_data = res.json()
    assert logs_data["total"] >= 1
    # Check that our logged session is in the items
    items = logs_data["items"]
    found = any(item["id"] == session_id for item in items)
    assert found

    # 3. End impersonation
    res = await client.post(f"/api/v1/platform/impersonation/{session_id}/end", headers=headers)
    assert res.status_code == 200
    assert res.json()["message"] == "Impersonation session ended successfully"

    # Verify log ended
    await db.refresh(log)
    assert log.terminated_at is not None


@pytest.mark.asyncio
async def test_delete_organization_clears_impersonation_fk_references(db, client):
    from app.modules.platform.models.organization import Organization

    target_org = Organization(name="Delete Org", slug="delete-org")
    admin_org = Organization(name="Admin Org", slug="admin-org")
    db.add_all([target_org, admin_org])
    await db.flush()

    super_admin = User(
        organization_id=admin_org.id,
        email="admin-delete@test.com",
        first_name="Admin",
        last_name="Delete",
        role="super_admin",
        platform_role="SUPER_ADMIN",
    )
    target_user = User(
        organization_id=target_org.id,
        email="target-delete@test.com",
        first_name="Target",
        last_name="Delete",
        role="organizer",
    )
    db.add_all([super_admin, target_user])
    await db.flush()

    log = ImpersonationLog(
        super_admin_id=super_admin.id,
        target_organization_id=target_org.id,
        target_user_id=target_user.id,
        reason="Delete org cleanup test",
        session_expires_at=datetime.now(timezone.utc),
    )
    db.add(log)
    await db.commit()

    token = create_access_token(super_admin)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.delete(f"/api/v1/platform/organizations/{target_org.id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["message"] == "Organization and all associated data successfully deleted"

    deleted_org = await db.get(Organization, target_org.id)
    assert deleted_org is None

    refreshed_log = await db.get(ImpersonationLog, log.id)
    assert refreshed_log is not None
    assert refreshed_log.target_user_id is None
    assert refreshed_log.target_organization_id is None
    assert refreshed_log.super_admin_id == super_admin.id
