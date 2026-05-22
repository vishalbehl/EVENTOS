# =============================================================
# Conference Platform — Auth Service Tests
# backend/tests/test_auth.py
#
# Tests cover:
#   - Password hashing and verification
#   - Access token creation and claim correctness
#   - Refresh token persistence and rotation
#   - Token family invalidation on reuse detection
#   - Login flow (success, wrong password, inactive user)
#   - Token revocation on logout
# =============================================================

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services.auth_service import (
    create_access_token,
    create_refresh_token_string,
    hash_password,
    login,
    persist_refresh_token,
    revoke_user_refresh_tokens,
    rotate_refresh_token,
    verify_password,
)
from tests.conftest import auth_headers, make_access_token


# ── Password hashing ──────────────────────────────────────────

class TestPasswordHashing:

    def test_hash_is_not_plaintext(self):
        plain = "SecureP@ssword1"
        hashed = hash_password(plain)
        assert hashed != plain

    def test_verify_correct_password(self):
        plain = "SecureP@ssword1"
        hashed = hash_password(plain)
        assert verify_password(plain, hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("correct")
        assert verify_password("wrong", hashed) is False

    def test_two_hashes_of_same_password_differ(self):
        """bcrypt uses random salt — same password → different hash."""
        plain = "same_password"
        h1 = hash_password(plain)
        h2 = hash_password(plain)
        assert h1 != h2

    def test_empty_password_is_rejected(self):
        """Empty string should still hash without error."""
        hashed = hash_password("")
        assert verify_password("", hashed) is True
        assert verify_password("notempty", hashed) is False


# ── Access token ──────────────────────────────────────────────

class TestAccessToken:

    def test_token_is_string(self, organizer: User):
        token = create_access_token(organizer)
        assert isinstance(token, str)
        assert len(token) > 50

    def test_token_claims_correct(self, organizer: User):
        token = create_access_token(organizer)
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        assert payload["sub"] == str(organizer.id)
        assert payload["role"] == organizer.role
        assert payload["org"] == str(organizer.organization_id)
        assert payload["type"] == "access"
        assert "jti" in payload
        assert "exp" in payload

    def test_token_expiry_in_future(self, organizer: User):
        import time
        token = create_access_token(organizer)
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        assert payload["exp"] > int(time.time())

    def test_super_admin_token_has_correct_role(self, super_admin: User):
        token = create_access_token(super_admin)
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        assert payload["role"] == "super_admin"

    def test_token_unique_per_call(self, organizer: User):
        """Each call generates a unique JTI."""
        t1 = create_access_token(organizer)
        t2 = create_access_token(organizer)
        p1 = jwt.decode(t1, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        p2 = jwt.decode(t2, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        assert p1["jti"] != p2["jti"]


# ── Refresh token ─────────────────────────────────────────────

class TestRefreshToken:

    @pytest.mark.asyncio
    async def test_persist_creates_hashed_record(self, db: AsyncSession, organizer: User):
        plain = create_refresh_token_string()
        record = await persist_refresh_token(db, organizer, plain)

        expected_hash = hashlib.sha256(plain.encode()).hexdigest()
        assert record.token_hash == expected_hash
        assert record.user_id == organizer.id
        assert record.is_revoked is False
        assert record.expires_at > datetime.now(timezone.utc)

    @pytest.mark.asyncio
    async def test_plain_token_not_stored(self, db: AsyncSession, organizer: User):
        plain = create_refresh_token_string()
        record = await persist_refresh_token(db, organizer, plain)
        assert plain not in record.token_hash
        assert record.token_hash != plain

    @pytest.mark.asyncio
    async def test_rotate_issues_new_token(self, db: AsyncSession, organizer: User):
        plain = create_refresh_token_string()
        old_record = await persist_refresh_token(db, organizer, plain)
        await db.flush()

        old_hash = hashlib.sha256(plain.encode()).hexdigest()
        new_plain, new_record = await rotate_refresh_token(
            db, old_hash, organizer, ip_address="127.0.0.1"
        )

        assert new_plain != plain
        assert new_record.family_id == old_record.family_id
        assert new_record.is_revoked is False

    @pytest.mark.asyncio
    async def test_rotate_revokes_old_token(self, db: AsyncSession, organizer: User):
        plain = create_refresh_token_string()
        old_record = await persist_refresh_token(db, organizer, plain)
        await db.flush()

        old_hash = hashlib.sha256(plain.encode()).hexdigest()
        await rotate_refresh_token(db, old_hash, organizer)

        result = await db.execute(
            select(RefreshToken).where(RefreshToken.id == old_record.id)
        )
        refreshed = result.scalar_one()
        assert refreshed.is_revoked is True
        assert refreshed.revoked_reason == "rotation"

    @pytest.mark.asyncio
    async def test_reuse_detection_invalidates_family(self, db: AsyncSession, organizer: User):
        """Using an already-revoked token must invalidate the whole family."""
        plain = create_refresh_token_string()
        record = await persist_refresh_token(db, organizer, plain)
        await db.flush()

        old_hash = hashlib.sha256(plain.encode()).hexdigest()

        # First rotation — legitimate
        new_plain, _ = await rotate_refresh_token(db, old_hash, organizer)
        await db.flush()

        # Reuse the already-rotated (now revoked) old token — token theft scenario
        with pytest.raises(ValueError, match="reuse"):
            await rotate_refresh_token(db, old_hash, organizer)

    @pytest.mark.asyncio
    async def test_rotate_wrong_user_raises(self, db: AsyncSession, organizer: User, super_admin: User):
        plain = create_refresh_token_string()
        await persist_refresh_token(db, organizer, plain)
        await db.flush()

        old_hash = hashlib.sha256(plain.encode()).hexdigest()
        with pytest.raises(ValueError, match="belong"):
            await rotate_refresh_token(db, old_hash, super_admin)

    @pytest.mark.asyncio
    async def test_revoke_all_tokens(self, db: AsyncSession, organizer: User):
        for _ in range(3):
            plain = create_refresh_token_string()
            await persist_refresh_token(db, organizer, plain)
        await db.flush()

        count = await revoke_user_refresh_tokens(db, organizer.id, reason="logout")
        assert count == 3

        # Verify all are revoked
        result = await db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == organizer.id,
                RefreshToken.is_revoked.is_(False),
            )
        )
        assert result.scalar_one_or_none() is None


# ── Login flow ────────────────────────────────────────────────

class TestLoginFlow:

    @pytest.mark.asyncio
    async def test_login_success_returns_tokens(self, db: AsyncSession, organizer: User):
        result = await login(db, organizer.email, "testpassword123")
        assert "access_token" in result
        assert "refresh_token" in result
        assert result["token_type"] == "bearer"
        assert result["user"].id == organizer.id

    @pytest.mark.asyncio
    async def test_login_wrong_password_raises(self, db: AsyncSession, organizer: User):
        with pytest.raises(ValueError, match="Invalid"):
            await login(db, organizer.email, "wrongpassword")

    @pytest.mark.asyncio
    async def test_login_unknown_email_raises(self, db: AsyncSession, organizer: User):
        with pytest.raises(ValueError, match="Invalid"):
            await login(db, "nobody@example.com", "testpassword123")

    @pytest.mark.asyncio
    async def test_login_inactive_user_raises(self, db: AsyncSession, organizer: User):
        organizer.is_active = False
        await db.flush()
        with pytest.raises(ValueError, match="deactivated"):
            await login(db, organizer.email, "testpassword123")

    @pytest.mark.asyncio
    async def test_login_updates_last_login_at(self, db: AsyncSession, organizer: User):
        assert organizer.last_login_at is None
        await login(db, organizer.email, "testpassword123")
        await db.refresh(organizer)
        assert organizer.last_login_at is not None

    @pytest.mark.asyncio
    async def test_login_access_token_valid(self, db: AsyncSession, organizer: User):
        result = await login(db, organizer.email, "testpassword123")
        token = result["access_token"]
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        assert payload["sub"] == str(organizer.id)
        assert payload["type"] == "access"
