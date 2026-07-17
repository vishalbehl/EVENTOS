# =============================================================
# Conference Platform — Middleware Tests
# backend/tests/test_middleware.py
#
# Tests cover:
#   - AuditMiddleware: resource extraction, action derivation
#   - AuthMiddleware: security headers, token state injection
#   - RateLimitMiddleware: per-path rules, in-memory window limiter
#   - Middleware does not interfere with successful requests
# =============================================================

from __future__ import annotations

import pytest

from app.middleware.audit_middleware import (
    _derive_action,
    _extract_jwt_claims,
    _extract_resource_type_and_id,
)
from app.middleware.rate_limit import _InMemoryLimiter, _find_rule


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

class TestInMemoryLimiter:

    def test_allows_requests_within_limit(self):
        limiter = _InMemoryLimiter()
        for _ in range(5):
            assert limiter.is_allowed("127.0.0.1", max_requests=10, window_seconds=60) is True

    def test_blocks_requests_exceeding_limit(self):
        limiter = _InMemoryLimiter()
        for _ in range(10):
            limiter.is_allowed("1.2.3.4", max_requests=10, window_seconds=60)
        # 11th request should be blocked
        assert limiter.is_allowed("1.2.3.4", max_requests=10, window_seconds=60) is False

    def test_different_ips_are_isolated(self):
        limiter = _InMemoryLimiter()
        for _ in range(10):
            limiter.is_allowed("1.1.1.1", max_requests=10, window_seconds=60)
        # 1.1.1.1 is at limit; 2.2.2.2 should still be allowed
        assert limiter.is_allowed("2.2.2.2", max_requests=10, window_seconds=60) is True
        assert limiter.is_allowed("1.1.1.1", max_requests=10, window_seconds=60) is False

    def test_window_resets_after_expiry(self):
        """Use a very short window to test expiry."""
        import time
        limiter = _InMemoryLimiter()
        for _ in range(3):
            limiter.is_allowed("5.5.5.5", max_requests=3, window_seconds=1)

        # At limit now
        assert limiter.is_allowed("5.5.5.5", max_requests=3, window_seconds=1) is False

        # Wait for window to expire
        time.sleep(1.1)
        assert limiter.is_allowed("5.5.5.5", max_requests=3, window_seconds=1) is True

    def test_cleanup_stale_removes_idle_ips(self):
        limiter = _InMemoryLimiter()
        limiter.is_allowed("9.9.9.9", max_requests=100, window_seconds=60)
        assert "9.9.9.9" in limiter._windows

        limiter.cleanup_stale(max_idle_seconds=0)  # mark as immediately stale
        assert "9.9.9.9" not in limiter._windows


class TestPathRuleFinder:

    def test_auth_login_path_gets_tight_limit(self):
        rule = _find_rule("/auth/login")
        assert rule.max_requests == 10
        assert rule.window_seconds == 60

    def test_upload_path_gets_upload_limit(self):
        rule = _find_rule("/upload/some-token")
        assert rule.max_requests == 5

    def test_generic_path_gets_global_limit(self):
        rule = _find_rule("/api/v1/events")
        assert rule.max_requests == 300

    def test_import_path_gets_import_limit(self):
        rule = _find_rule("/import/excel")
        assert rule.max_requests == 5


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
