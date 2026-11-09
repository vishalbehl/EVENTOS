# =============================================================
# Conference Platform — Auth Service
# backend/app/services/auth_service.py
#
# Handles all authentication logic:
#   - Password hashing / verification
#   - JWT access token creation
#   - Refresh token lifecycle (create, rotate, revoke)
#   - Login flow (returns both token types)
#   - Audit log entries for auth events
# =============================================================

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt
from loguru import logger
from passlib.context import CryptContext
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User

# ── Password hashing ──────────────────────────────────────────
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Return bcrypt hash of the given plain-text password."""
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if plain matches the stored bcrypt hash."""
    return _pwd_context.verify(plain, hashed)


# ── Token helpers ─────────────────────────────────────────────

def _hash_token(token: str) -> str:
    """SHA-256 hex digest — used to store refresh tokens safely."""
    return hashlib.sha256(token.encode()).hexdigest()


def create_access_token(
    user: User,
    *,
    session_id: Optional[uuid.UUID] = None,
    access_mode: str = "DIRECT",
    active_organization_id: Optional[uuid.UUID] = None,
    acting_organization_id: Optional[uuid.UUID] = None,
    active_workspace_id: Optional[uuid.UUID] = None,
    active_event_id: Optional[uuid.UUID] = None,
    relationship_id: Optional[uuid.UUID] = None,
    mfa_authenticated_at: Optional[datetime] = None,
    impersonator_id: Optional[uuid.UUID] = None,
    impersonation_session_id: Optional[uuid.UUID] = None,
    expires_minutes: Optional[int] = None,
) -> str:
    """
    Create a short-lived JWT access token for the given user.

    Claims:
        sub  → user UUID (string)
        role → user role
        org  → organization UUID (string)
        jti  → unique token ID
        type → "access"
        exp  → expiry timestamp
    """
    if type(user.auth_revision) is not int or user.auth_revision < 1:
        raise ValueError("Persisted authentication revision is required before issuing access.")
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    amr = ["pwd"]
    if mfa_authenticated_at:
        amr.append("mfa")
    active_organization_id = active_organization_id or user.organization_id
    acting_organization_id = acting_organization_id or active_organization_id
    if access_mode not in {"DIRECT", "DELEGATED"}:
        raise ValueError("Unsupported access context mode.")
    if access_mode == "DIRECT":
        if (acting_organization_id != active_organization_id or relationship_id is not None or
                active_event_id is not None):
            raise ValueError("Invalid direct access context.")
    elif not all((session_id, active_organization_id, acting_organization_id,
                  active_workspace_id, relationship_id)) or acting_organization_id == active_organization_id:
        raise ValueError("Invalid delegated access context.")
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "org": str(user.organization_id),
        "jti": str(uuid.uuid4()),
        "auth_revision": user.auth_revision,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "auth_time": int((mfa_authenticated_at or now).timestamp()),
        "amr": amr,
        "ctx_mode": access_mode,
        "ctx_org": str(active_organization_id),
        "ctx_actor_org": str(acting_organization_id),
    }
    if session_id:
        payload["sid"] = str(session_id)
    if active_workspace_id:
        payload["ctx_ws"] = str(active_workspace_id)
    if active_event_id:
        payload["ctx_event"] = str(active_event_id)
    if relationship_id:
        payload["ctx_rel"] = str(relationship_id)
    if impersonator_id:
        payload["impersonator_id"] = str(impersonator_id)
    if impersonation_session_id:
        payload["impersonation_session_id"] = str(impersonation_session_id)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token_string() -> str:
    """Generate a cryptographically secure random refresh token string."""
    return str(uuid.uuid4()) + "-" + str(uuid.uuid4())


async def persist_refresh_token(
    db: AsyncSession,
    user: User,
    plain_token: str,
    *,
    family_id: Optional[uuid.UUID] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    device_info: Optional[str] = None,
    mfa_authenticated_at: Optional[datetime] = None,
    access_mode: str = "DIRECT",
    active_organization_id: Optional[uuid.UUID] = None,
    acting_organization_id: Optional[uuid.UUID] = None,
    active_workspace_id: Optional[uuid.UUID] = None,
    active_event_id: Optional[uuid.UUID] = None,
    relationship_id: Optional[uuid.UUID] = None,
) -> RefreshToken:
    """
    Hash and persist a new refresh token record.
    Pass family_id to link it to an existing login session (token rotation).
    """
    token_hash = _hash_token(plain_token)
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    selected_organization_id = active_organization_id or user.organization_id
    selected_actor_id = acting_organization_id or selected_organization_id
    record = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        family_id=family_id or uuid.uuid4(),
        device_info=device_info,
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=expire,
        mfa_authenticated_at=mfa_authenticated_at,
        access_mode=access_mode,
        active_organization_id=selected_organization_id,
        acting_organization_id=selected_actor_id,
        active_workspace_id=active_workspace_id,
        active_event_id=active_event_id,
        relationship_id=relationship_id,
    )
    db.add(record)
    await db.flush()  # get the ID without committing
    logger.debug(f"Persisted refresh token for user {user.id}")
    return record


async def rotate_refresh_token(
    db: AsyncSession,
    old_token_hash: str,
    user: User,
    *,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> tuple[str, RefreshToken]:
    """
    Implement refresh token rotation:
    1. Load and validate existing token
    2. Detect reuse (token theft): invalidate entire family
    3. Revoke old token
    4. Issue new token in same family

    Returns (new_plain_token, new_RefreshToken).
    Raises ValueError on invalid / expired / reused token.
    """
    # Match invalidation's identity-before-refresh lock ordering. Refresh cannot
    # publish a successor after a committed all-session revocation.
    current = await db.scalar(select(User).where(User.id == user.id,
        User.deleted_at.is_(None), User.is_active.is_(True)).with_for_update()
        .execution_options(populate_existing=True))
    if current is None:
        raise ValueError("User account is unavailable.")
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == old_token_hash)
        .with_for_update().execution_options(populate_existing=True)
    )
    old_record = result.scalar_one_or_none()

    if old_record is None:
        raise ValueError("Refresh token not found.")

    if old_record.user_id != user.id:
        raise ValueError("Token does not belong to this user.")

    # Token reuse detected — invalidate the entire family
    if old_record.is_revoked:
        logger.warning(
            f"Refresh token reuse detected for user {user.id} "
            f"family={old_record.family_id}. Invalidating family."
        )
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == old_record.family_id)
            .values(
                is_revoked=True,
                revoked_at=datetime.now(timezone.utc),
                revoked_reason="token_reuse",
            )
        )
        await db.commit()
        raise ValueError("Token reuse detected. All sessions invalidated.")

    if old_record.is_expired:
        raise ValueError("Refresh token has expired. Please log in again.")

    # Revoke old token
    old_record.is_revoked = True
    old_record.revoked_at = datetime.now(timezone.utc)
    old_record.revoked_reason = "rotation"

    # Issue new token in the same family
    new_plain = create_refresh_token_string()
    new_record = await persist_refresh_token(
        db,
        user,
        new_plain,
        family_id=old_record.family_id,
        ip_address=ip_address,
        user_agent=user_agent,
        mfa_authenticated_at=old_record.mfa_authenticated_at,
        access_mode=old_record.access_mode,
        active_organization_id=old_record.active_organization_id,
        acting_organization_id=old_record.acting_organization_id,
        active_workspace_id=old_record.active_workspace_id,
        active_event_id=old_record.active_event_id,
        relationship_id=old_record.relationship_id,
    )
    return new_plain, new_record


async def revoke_user_refresh_tokens(
    db: AsyncSession,
    user_id: uuid.UUID,
    reason: str = "logout",
) -> int:
    """
    Revoke all active refresh tokens for a user.
    Returns the number of tokens revoked.
    """
    now = datetime.now(timezone.utc)
    # The database revision is authoritative even if caches/Redis are unavailable.
    # Arithmetic UPDATE serializes concurrent invalidations without lost increments.
    await db.execute(update(User).where(User.id == user_id).values(
        auth_revision=User.auth_revision + 1))
    result = await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.is_revoked.is_(False),
        )
        .values(is_revoked=True, revoked_at=now, revoked_reason=reason)
    )
    count = result.rowcount
    logger.info(f"Revoked {count} refresh token(s) for user {user_id} (reason: {reason})")
    return count


async def revoke_refresh_token_family(
    db: AsyncSession,
    token_hash: str,
    reason: str = "logout",
) -> int:
    """Revoke only the browser/device session containing the supplied token."""
    result = await db.execute(select(RefreshToken.family_id).where(RefreshToken.token_hash == token_hash))
    family_id = result.scalar_one_or_none()
    if family_id is None:
        return 0
    revoked = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.is_revoked.is_(False))
        .values(is_revoked=True, revoked_at=datetime.now(timezone.utc), revoked_reason=reason)
    )
    return revoked.rowcount


async def login(
    db: AsyncSession,
    email: str,
    password: str,
    *,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    mfa_code: Optional[str] = None,
    access_expires_minutes: Optional[int] = None,
) -> dict:
    """
    Authenticate a user by email + password.

    Returns dict with:
        access_token  → short-lived JWT
        refresh_token → long-lived opaque token
        token_type    → "bearer"
        user          → User ORM object

    Raises ValueError with a safe message on any failure.
    """
    # Always hash the password to prevent timing attacks
    result = await db.execute(
        select(User).options(selectinload(User.organization)).where(User.email == email.lower().strip())
    )
    user = result.scalar_one_or_none()

    _GENERIC_ERROR = "Invalid email or password."

    if user is None:
        # Still call verify to maintain constant time
        _pwd_context.dummy_verify()
        raise ValueError(_GENERIC_ERROR)

    if not user.password_hash or not verify_password(password, user.password_hash):
        raise ValueError(_GENERIC_ERROR)

    if not user.is_active or user.deleted_at is not None:
        raise ValueError("Your account has been deactivated. Contact your administrator.")

    mfa_authenticated_at = None
    from app.modules.identity.services.mfa_service import requires_privileged_mfa, verify_user_mfa
    if settings.ENFORCE_PRIVILEGED_MFA and requires_privileged_mfa(user):
        mfa_authenticated_at = await verify_user_mfa(db, user, mfa_code)

    # Issue both credentials into one browser/device session. Selection later
    # changes this family, never the user's home organisation.
    session_id = uuid.uuid4()
    plain_refresh = create_refresh_token_string()
    await persist_refresh_token(
        db, user, plain_refresh,
        family_id=session_id,
        ip_address=ip_address,
        user_agent=user_agent,
        mfa_authenticated_at=mfa_authenticated_at,
    )
    access_token = create_access_token(
        user,
        session_id=session_id,
        mfa_authenticated_at=mfa_authenticated_at,
        expires_minutes=access_expires_minutes,
    )

    # Update last_login_at
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info(f"Successful login for user {user.id} ({user.email})")

    return {
        "access_token": access_token,
        "refresh_token": plain_refresh,
        "token_type": "bearer",
        "user": user,
    }


async def write_auth_audit(
    db: AsyncSession,
    *,
    user_id: Optional[uuid.UUID],
    action: str,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """Append an auth-related entry to the audit log (fire-and-forget style)."""
    log = AuditLog(
        actor_user_id=user_id,
        resource_type="user",
        resource_id=user_id or uuid.uuid4(),
        action_type=action,
        actor_ip=ip_address,
        actor_user_agent=user_agent,
        is_sensitive=True,
    )
    db.add(log)
    # Caller is responsible for committing
