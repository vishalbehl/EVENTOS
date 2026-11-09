"""Token primitives and identity-constrained invitation acceptance.

Raw invitation credentials exist only in memory for one-time issuance. They
are never stored in membership, idempotency responses or audit records.
"""
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import uuid

from fastapi import HTTPException
from sqlalchemy import select, func, text
from sqlalchemy.exc import IntegrityError

from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization import Organization
from app.modules.identity.models.user import User
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.services.access_foundation import lock_revision


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def issue_token(member: OrganizationMember) -> str:
    token = secrets.token_urlsafe(32)
    member.invite_token = None
    member.invite_token_digest = token_digest(token)
    member.invited_at = datetime.now(timezone.utc)
    member.invite_expires_at = member.invited_at + timedelta(days=7)
    member.invite_consumed_at = None
    return token


def invitation_state(member, now=None):
    if member.accepted_at is not None:
        return "ACCEPTED" if member.is_active else "SUSPENDED"
    if not member.is_active:
        return "REVOKED"
    if not member.invite_expires_at or member.invite_expires_at <= (now or datetime.now(timezone.utc)):
        return "EXPIRED"
    return "INVITED"


async def admission(actor_id, organization_id):
    from app.core.distributed_rate_limit import Budget, admit, identity_key
    correlation_id = str(uuid.uuid4())
    try:
        result = await admit([
            Budget(f"access-rate:invitation:operator:{identity_key(str(actor_id))}", 20, 3600, fixed=True),
            Budget(f"access-rate:invitation:tenant:{identity_key(str(organization_id))}", 100, 86400, fixed=True),
        ])
    except Exception:
        raise HTTPException(503, detail={"code": "RATE_LIMIT_UNAVAILABLE", "message": "Invitation protection is unavailable.", "correlation_id": correlation_id}, headers={"Retry-After": "5", "X-Correlation-ID": correlation_id}) from None
    if not result.allowed:
        raise HTTPException(429, detail={"code": "RATE_LIMITED", "message": "Invitation allowance exhausted.", "correlation_id": correlation_id}, headers={"Retry-After": str(result.retry_after), "X-Correlation-ID": correlation_id})


async def locate(db, actor, token):
    # This is a deliberate, narrow identity projection, not a generic tenant
    # bypass: both possession and the authenticated account email must match.
    table = OrganizationMember.__table__
    digest = token_digest(token)
    await db.execute(text("SELECT set_config('app.invitation_token_digest', :digest, true), set_config('app.invitation_identity_email', :email, true)"),
                     {"digest": digest, "email": actor.email.lower()})
    try:
        row = (await db.execute(select(table.c.id, table.c.organization_id).where(
            table.c.invite_token_digest == digest,
            func.lower(table.c.invite_email) == actor.email.lower(),
            table.c.is_active.is_(True),
        ).limit(1))).first()
    finally:
        if db.is_active:
            await db.execute(text("SELECT set_config('app.invitation_token_digest', '', true), set_config('app.invitation_identity_email', '', true)"))
    if row is None:
        raise HTTPException(404, detail={"code": "INVITATION_NOT_AVAILABLE"})
    return row, digest


async def preview(db, actor, token):
    row, digest = await locate(db, actor, token)
    async with TenantContextGuard.scoped(db, row.organization_id):
        member = await db.scalar(select(OrganizationMember).where(
            OrganizationMember.id == row.id, OrganizationMember.invite_token_digest == digest
        ).execution_options(populate_existing=True))
        if member is None or invitation_state(member) != "INVITED":
            raise HTTPException(404, detail={"code": "INVITATION_NOT_AVAILABLE"})
        org = await db.get(Organization, row.organization_id)
        if org is None or not org.is_active or org.suspended_at is not None:
            raise HTTPException(404, detail={"code": "INVITATION_NOT_AVAILABLE"})
        return {"membership_id": str(member.id), "organization_id": str(org.id),
                "organization_name": org.name, "org_role": member.org_role,
                "version": member.version, "expires_at": member.invite_expires_at.isoformat()}


async def accept(db, actor, token, version, key):
    try:
        row, digest = await locate(db, actor, token)
        async with TenantContextGuard.scoped(db, row.organization_id):
            revision = await lock_revision(db, row.organization_id, write=True)
            member = await db.scalar(select(OrganizationMember).where(
                OrganizationMember.id == row.id, OrganizationMember.organization_id == row.organization_id,
                OrganizationMember.invite_token_digest == digest,
                func.lower(OrganizationMember.invite_email) == actor.email.lower(),
            ).with_for_update().execution_options(populate_existing=True))
            if member is None or not member.is_active or not member.invite_expires_at or member.invite_expires_at <= datetime.now(timezone.utc):
                raise HTTPException(404, detail={"code": "INVITATION_NOT_AVAILABLE"})
            org = await db.get(Organization, row.organization_id)
            if org is None or not org.is_active or org.suspended_at is not None:
                raise HTTPException(404, detail={"code": "INVITATION_NOT_AVAILABLE"})
            idem = await begin_idempotent(db, organization_id=row.organization_id, actor_id=actor.id,
                operation="organization.invitation.accept", key=key,
                payload={"token_digest": digest, "version": version})
            replay = replay_response(idem)
            if replay is not None:
                if member.user_id != actor.id or member.accepted_at is None:
                    raise HTTPException(404, detail={"code": "INVITATION_NOT_AVAILABLE"})
                result = replay[1]  # Receipt only; never activate a second time.
            else:
                if member.accepted_at is not None or member.invite_consumed_at is not None:
                    raise HTTPException(404, detail={"code": "INVITATION_NOT_AVAILABLE"})
                if member.version != version:
                    raise HTTPException(412, detail={"code": "STALE_INVITATION"})
                # Identity deactivation/owner acceptance must serialize. Never
                # install an owner using an identity snapshot from before the
                # policy/member locks, nor accept after verified-email changes.
                identity = User.__table__.c
                current_identity = (await db.execute(select(identity.email, identity.auth_revision).where(
                    identity.id == actor.id, identity.is_active.is_(True), identity.deleted_at.is_(None))
                    .with_for_update())).first()
                if current_identity is None or current_identity.auth_revision != actor.auth_revision or current_identity.email.lower() != actor.email.lower():
                    raise HTTPException(401, detail={"code": "SESSION_REVOKED"})
                existing = await db.scalar(select(OrganizationMember.id).where(
                    OrganizationMember.organization_id == row.organization_id,
                    OrganizationMember.user_id == actor.id, OrganizationMember.id != member.id))
                if existing is not None:
                    raise HTTPException(409, detail={"code": "MEMBERSHIP_CONFLICT"})
                member.user_id = actor.id
                member.accepted_at = member.invite_consumed_at = datetime.now(timezone.utc)
                member.version += 1
                revision.revision += 1
                result = {"membership_id": str(member.id), "organization_id": str(row.organization_id),
                          "organization_name": org.name, "state": "ACCEPTED", "version": member.version,
                          "policy_revision": revision.revision}
                db.add(AuditLog(organization_id=row.organization_id, actor_user_id=actor.id,
                    actor_role=actor.role, resource_type="organization_member", resource_id=member.id,
                    action_type="ORGANIZATION_INVITATION_ACCEPTED", correlation_id=uuid.uuid4(), is_sensitive=True,
                    new_state={**result, "acting_organization_id": str(actor.organization_id),
                               "target_organization_id": str(row.organization_id), "reason": "Authenticated invited identity accepted"}))
                await complete_idempotent(db, idem, response_status=200, response_body=result, resource_id=member.id)
            await db.commit()
        return result
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, detail={"code": "MEMBERSHIP_CONFLICT"}) from None
    except Exception:
        await db.rollback()
        raise
