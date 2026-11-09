# =============================================================
# Conference Platform — Middleware Tests
# backend/tests/test_middleware.py
#
# Tests cover:
#   - AuditMiddleware: resource extraction, action derivation
#   - AuthMiddleware: security headers, token state injection
#   - RateLimitMiddleware: registered distributed policies and compatibility alias
#   - Middleware does not interfere with successful requests
# =============================================================

from __future__ import annotations

import pytest

from app.middleware.audit_middleware import (
    _derive_action,
    _extract_jwt_claims,
    _extract_resource_type_and_id,
)
from app.core.rate_policy import POLICIES, RatePolicyRegistry, template_policy
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.rate_limiter import RateLimiterMiddleware


# ── AuditLogMiddleware unit tests ─────────────────────────────

class TestAuditResourceExtraction:

    def test_extract_speaker_from_path(self):
        entity_type, entity_id = _extract_resource_type_and_id("/api/v1/speakers")
        assert entity_type == "speaker"

    def test_extract_file_from_path(self):
        entity_type, _ = _extract_resource_type_and_id("/api/v1/files")
        assert entity_type == "file"

    def test_extract_session_from_path(self):
        entity_type, _ = _extract_resource_type_and_id("/api/v1/sessions")
        assert entity_type == "session"

    def test_extract_event_from_path(self):
        entity_type, _ = _extract_resource_type_and_id("/api/v1/events")
        assert entity_type == "event"

    def test_extract_import_from_path(self):
        entity_type, _ = _extract_resource_type_and_id("/api/v1/imports")
        assert entity_type == "import"

    def test_extract_room_from_path(self):
        entity_type, _ = _extract_resource_type_and_id("/api/v1/rooms")
        assert entity_type == "room"

    def test_extract_uuid_from_path(self):
        target_id = "550e8400-e29b-41d4-a716-446655440000"
        entity_type, entity_id = _extract_resource_type_and_id(f"/api/v1/speakers/{target_id}")
        assert entity_type == "speaker"
        assert entity_id is not None
        assert str(entity_id) == target_id

    def test_no_uuid_in_path_returns_none(self):
        _, entity_id = _extract_resource_type_and_id("/api/v1/speakers")
        assert entity_id is None

    def test_unknown_path_returns_unknown(self):
        entity_type, _ = _extract_resource_type_and_id("/")
        assert entity_type == "unknown"


class TestAuditLogActionDerivation:

    def test_post_to_generic_endpoint_is_created(self):
        assert _derive_action("POST", "/api/v1/speakers", 201) == "created"

    def test_delete_is_deleted(self):
        assert _derive_action("DELETE", "/api/v1/speakers/123", 200) == "deleted"

    def test_put_is_updated(self):
        assert _derive_action("PUT", "/api/v1/events/123", 200) == "updated"

    def test_patch_is_updated(self):
        assert _derive_action("PATCH", "/api/v1/rooms/123", 200) == "updated"

    def test_post_approve_is_approved(self):
        assert _derive_action("POST", "/api/v1/files/123/approve", 200) == "approved"

    def test_post_reject_is_rejected(self):
        assert _derive_action("POST", "/api/v1/files/123/reject", 200) == "rejected"

    def test_post_login_is_login(self):
        assert _derive_action("POST", "/auth/login", 200) == "login"

    def test_post_logout_is_logout(self):
        assert _derive_action("POST", "/auth/logout", 200) == "logout"

    def test_post_import_is_imported(self):
        assert _derive_action("POST", "/api/v1/import/excel", 202) == "imported"

    def test_post_checkin_is_checked_in(self):
        assert _derive_action("POST", "/api/v1/srr/checkin/123", 200) == "checked_in"


class TestJWTExtraction:

    def test_extract_user_from_valid_jwt(self, organizer):
        from app.modules.identity.services.auth_service import create_access_token
        token = create_access_token(organizer)
        user_id, _, _, _ = _extract_jwt_claims(f"Bearer {token}")
        assert user_id == organizer.id

    def test_extract_returns_none_for_missing_header(self):
        assert _extract_jwt_claims(None) == (None, None, None, None)

    def test_extract_returns_none_for_malformed_token(self):
        assert _extract_jwt_claims("Bearer not-a-real-token") == (None, None, None, None)

    def test_extract_returns_none_for_non_bearer(self):
        assert _extract_jwt_claims("Basic dXNlcjpwYXNz") == (None, None, None, None)


# ── RateLimitMiddleware unit tests ────────────────────────────

class TestDistributedRatePolicy:

    def test_legacy_middleware_name_delegates_to_distributed_implementation(self):
        assert issubclass(RateLimitMiddleware, RateLimiterMiddleware)

    def test_release_policy_budgets_are_registered(self):
        assert (POLICIES["login"].capacity, POLICIES["login"].window) == (30, 300)
        assert (POLICIES["uploads"].capacity, POLICIES["uploads"].window) == (30, 60)
        assert (POLICIES["reads"].capacity, POLICIES["reads"].burst) == (120, 30)
        assert (POLICIES["writes"].capacity, POLICIES["writes"].burst) == (60, 10)

    def test_template_fallback_uses_registered_families(self):
        assert template_policy("/api/v1/auth/login", "POST") is POLICIES["login"]
        assert template_policy("/api/v1/portal/registration/event/upload", "POST") is POLICIES["uploads"]
        assert template_policy("/api/v1/events", "GET") is POLICIES["reads"]
        assert template_policy("/api/v1/events", "PATCH") is POLICIES["writes"]

    def test_route_aliases_can_share_one_operation_bucket(self):
        registry = RatePolicyRegistry()
        registry.register("/api/v1/forms/{form_id}", "GET", "read_form", POLICIES["reads"])
        registry.register("/api/v1/legacy/forms/{form_id}", "GET", "read_form", POLICIES["reads"])
        canonical = registry.resolve("/api/v1/forms/abc", "GET")
        compatibility = registry.resolve("/api/v1/legacy/forms/abc", "GET")
        assert canonical is not None and compatibility is not None
        assert canonical.operation_id == compatibility.operation_id == "read_form"
        assert canonical.policy is compatibility.policy is POLICIES["reads"]


# ── AuthMiddleware security headers ───────────────────────────

class TestSecurityHeaders:

    @pytest.mark.asyncio
    async def test_security_headers_on_health_response(self, client):
        response = await client.get("/health")
        assert response.status_code == 200
        assert "x-content-type-options" in response.headers
        assert response.headers["x-content-type-options"] == "nosniff"
        assert "x-frame-options" in response.headers
        assert response.headers["x-frame-options"] == "DENY"

    @pytest.mark.asyncio
    async def test_xss_protection_header(self, client):
        response = await client.get("/health")
        assert "x-xss-protection" in response.headers
