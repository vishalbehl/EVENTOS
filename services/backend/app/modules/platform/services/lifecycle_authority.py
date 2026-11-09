"""Bounded platform proof and deterministic policy locking for lifecycle work."""
import uuid

from fastapi import HTTPException
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.identity.models.user import User
from app.modules.rbac.services.access_foundation import lock_revision
from app.modules.rbac.services.platform_permissions import platform_permission_authority


async def lock_lifecycle_authority(db, organization_id, actor_id, target_organization_id=None,
                                   *, expected_auth_revision=None):
    # actor_id comes from authenticated identity or the durable job requester,
    # never an organisation selector supplied as proof of customer membership.
    await platform_permission_authority(db, actor_id, "platform:organizations:manage")
    identity = User.__table__.c
    home = await db.scalar(select(identity.organization_id).where(identity.id == actor_id))
    if home is None:
        raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
    scopes = {home, organization_id}
    if target_organization_id is not None:
        scopes.add(target_organization_id)
    if any(not isinstance(scope, uuid.UUID) for scope in scopes):
        raise HTTPException(422, detail={"code": "INVALID_LIFECYCLE_SCOPE"})
    revisions = {}
    for scope in sorted(scopes, key=str):
        async with TenantContextGuard.scoped(db, scope):
            revisions[scope] = await lock_revision(db, scope, write=True)
    # Revocation and identity administration take these same revision locks.
    # The first permission check is discovery, not the mutation's final proof.
    await platform_permission_authority(db, actor_id, "platform:organizations:manage")
    current = (await db.execute(select(identity.organization_id, identity.auth_revision).where(
        identity.id == actor_id, identity.is_active.is_(True), identity.deleted_at.is_(None)
    ))).one_or_none()
    if current is None or current.organization_id != home:
        raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
    if expected_auth_revision is not None and current.auth_revision != expected_auth_revision:
        raise HTTPException(401, detail={"code": "SESSION_REVOKED"})
    return home, revisions
