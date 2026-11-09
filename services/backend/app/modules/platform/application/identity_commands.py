"""Transaction-owning administrative identity commands."""

from __future__ import annotations
import uuid

from fastapi import HTTPException
from sqlalchemy import delete, select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.commercial_support import ActivityTimeline
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User
from app.modules.identity.models.identity_domain_tables import MfaDevice
from app.modules.identity.services.auth_service import revoke_user_refresh_tokens


class IdentityAdminCommandService:
    """Perform administrative session changes atomically."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def force_logout(self, *, user_id, actor: User, reason: str,
                           expected: int, idempotency_key: str) -> dict:
        return await self._security_action(user_id=user_id, actor=actor, reason=reason,
            expected=expected, idempotency_key=idempotency_key, action="sessions.revoke")

    async def reset_2fa(self, *, user_id, actor: User, reason: str,
                        expected: int, idempotency_key: str) -> dict:
        return await self._security_action(user_id=user_id, actor=actor, reason=reason,
            expected=expected, idempotency_key=idempotency_key, action="mfa.reset")

    async def _security_action(self, *, user_id, actor: User, reason: str,
                               expected: int, idempotency_key: str, action: str) -> dict:
        from app.core.tenant_context import TenantContextGuard
        from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
        from app.modules.rbac.services.access_foundation import lock_revision, check_version
        from app.modules.rbac.services.platform_permissions import platform_permission_authority
        try:
            if action not in {"sessions.revoke", "mfa.reset"}:
                raise ValueError("Unknown identity security action")
            if not isinstance(reason, str) or not 12 <= len(reason.strip()) <= 1000:
                raise HTTPException(422, detail={"code": "AUDIT_REASON_REQUIRED"})
            if type(expected) is not int or expected < 1:
                raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
            reason = reason.strip()
            await platform_permission_authority(self.db, actor.id, "platform:administration:manage")
            actor_org = await self.db.scalar(select(User.organization_id).where(
                User.id == actor.id, User.is_active.is_(True), User.deleted_at.is_(None)))
            if actor_org is None:
                raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
            async with TenantContextGuard.scoped(self.db, actor_org):
                actor_revision = await lock_revision(self.db, actor_org, write=True)
                await platform_permission_authority(self.db, actor.id, "platform:administration:manage")
                identity = User.__table__.c
                target_org = await self.db.scalar(select(identity.organization_id).where(
                    identity.id == user_id, identity.deleted_at.is_(None)))
                if target_org is None:
                    raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
                async with TenantContextGuard.scoped(self.db, target_org):
                    target_revision = actor_revision if target_org == actor_org else await lock_revision(self.db, target_org, write=True)
                    async with TenantContextGuard.scoped(self.db, actor_org):
                        receipt = await begin_idempotent(self.db, organization_id=actor_org, actor_id=actor.id,
                            operation=f"platform.identity.{action}", key=idempotency_key,
                            payload={"user_id": str(user_id), "target_organization_id": str(target_org),
                                     "version": expected, "reason": reason})
                    replay = replay_response(receipt)
                    if replay is not None:
                        await self.db.commit()
                        return replay[1]
                    target = await self.db.scalar(select(User).where(User.id == user_id,
                        User.organization_id == target_org, User.deleted_at.is_(None))
                        .with_for_update().execution_options(populate_existing=True))
                    if target is None:
                        raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
                    check_version(target.version, expected)
                    if action == "mfa.reset" and target.id == actor.id:
                        raise HTTPException(409, detail={"code": "SELF_ADMIN_MFA_RESET_FORBIDDEN"})
                    before = {"version": target.version, "is_2fa_enabled": bool(target.is_2fa_enabled)}
                    async with TenantContextGuard.scoped(self.db, actor_org):
                        actor_revision.revision += 1
                        await self.db.flush()
                    target.version += 1
                    if target_org != actor_org:
                        target_revision.revision += 1
                    if action == "mfa.reset":
                        target.is_2fa_enabled = False
                        target.two_factor_secret = None
                        await self.db.execute(delete(MfaDevice).where(MfaDevice.user_id == user_id))
                    revoked = await revoke_user_refresh_tokens(self.db, user_id,
                        reason="admin_mfa_reset" if action == "mfa.reset" else "FORCE_LOGOUT_BY_ADMIN")
                    correlation_id = uuid.uuid4()
                    output = {"success": True, "revoked": revoked, "version": target.version,
                        "policy_revision": target_revision.revision, "correlation_id": str(correlation_id)}
                    self.db.add(AuditLog(organization_id=target_org, actor_user_id=actor.id,
                        action_type="USER_MFA_RESET" if action == "mfa.reset" else "USER_SESSIONS_REVOKED",
                        resource_type="user", resource_id=user_id, old_state=before,
                        new_state={**output, "acting_organization_id": str(actor_org),
                            "target_organization_id": str(target_org)},
                        change_diff={"reason": reason}, correlation_id=correlation_id, is_sensitive=True))
                    await self.db.flush()
                    async with TenantContextGuard.scoped(self.db, actor_org):
                        await complete_idempotent(self.db, receipt, response_status=200,
                            response_body=output, resource_id=target.id)
                    await self.db.commit()
                    return output
        except Exception:
            await self.db.rollback()
            raise

    async def update_status(self, *, user_id, actor: User, is_active: bool, reason: str,
                            expected: int, idempotency_key: str) -> dict:
        from app.core.tenant_context import TenantContextGuard
        from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
        from app.modules.rbac.services.access_foundation import lock_revision, check_version
        from app.modules.rbac.services.platform_permissions import platform_permission_authority
        try:
            if type(is_active) is not bool or not isinstance(reason, str) or not 12 <= len(reason.strip()) <= 1000:
                raise HTTPException(422, detail={"code": "INVALID_IDENTITY_STATUS_CHANGE"})
            if type(expected) is not int or expected < 1:
                raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
            reason = reason.strip()
            await platform_permission_authority(self.db, actor.id, "platform:administration:manage")
            actor_org = await self.db.scalar(select(User.organization_id).where(
                User.id == actor.id, User.is_active.is_(True), User.deleted_at.is_(None)))
            if actor_org is None:
                raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
            async with TenantContextGuard.scoped(self.db, actor_org):
                actor_revision = await lock_revision(self.db, actor_org, write=True)
                await platform_permission_authority(self.db, actor.id, "platform:administration:manage")
                # Explicit platform-authorised metadata projection, never a caller tenant selector.
                identity = User.__table__.c
                target_org = await self.db.scalar(select(identity.organization_id).where(
                    identity.id == user_id, identity.deleted_at.is_(None)))
                if target_org is None:
                    raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
                async with TenantContextGuard.scoped(self.db, target_org):
                    target_revision = actor_revision if target_org == actor_org else await lock_revision(self.db, target_org, write=True)
                    async with TenantContextGuard.scoped(self.db, actor_org):
                        receipt = await begin_idempotent(self.db, organization_id=actor_org, actor_id=actor.id,
                            operation="platform.identity.status.update", key=idempotency_key,
                            payload={"user_id": str(user_id), "target_organization_id": str(target_org),
                                     "is_active": is_active, "version": expected, "reason": reason})
                    replay = replay_response(receipt)
                    if replay is not None:
                        await self.db.commit()
                        return replay[1]
                    target = await self.db.scalar(select(User).where(User.id == user_id,
                        User.organization_id == target_org, User.deleted_at.is_(None))
                        .with_for_update().execution_options(populate_existing=True))
                    if target is None:
                        raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
                    check_version(target.version, expected)
                    if target.id == actor.id and not is_active:
                        raise HTTPException(409, detail={"code": "SELF_DEACTIVATION_FORBIDDEN"})
                    if not is_active:
                        from app.modules.rbac.services.identity_ownership import require_transferred_ownership_before_deactivation
                        await require_transferred_ownership_before_deactivation(self.db, actor, target)
                    if target.platform_role == "SUPER_ADMIN" and target.is_active and not is_active:
                        admins = await self.db.scalar(select(func.count(User.id)).where(
                            User.organization_id == target_org, User.platform_role == "SUPER_ADMIN",
                            User.is_active.is_(True), User.deleted_at.is_(None)))
                        if admins <= 1:
                            raise HTTPException(409, detail={"code": "FINAL_PLATFORM_ADMIN_REQUIRED"})
                    before = target.is_active
                    # Flush the acting policy change before dirtying customer-owned rows.
                    async with TenantContextGuard.scoped(self.db, actor_org):
                        actor_revision.revision += 1
                        await self.db.flush()
                    target.is_active = is_active
                    target.version += 1
                    target.auth_revision += 1
                    if target_org != actor_org:
                        target_revision.revision += 1
                    revoked_sessions = 0
                    if not is_active:
                        result = await self.db.execute(update(RefreshToken).where(
                            RefreshToken.user_id == user_id, RefreshToken.is_revoked.is_(False))
                            .values(is_revoked=True, revoked_reason="USER_DEACTIVATED_BY_ADMIN"))
                        revoked_sessions = int(result.rowcount or 0)
                    action = "USER_ACTIVATED" if is_active else "USER_DEACTIVATED"
                    correlation_id = uuid.uuid4()
                    output = {"is_active": is_active, "version": target.version,
                        "policy_revision": target_revision.revision, "sessions_revoked": revoked_sessions,
                        "correlation_id": str(correlation_id)}
                    self.db.add(ActivityTimeline(organization_id=target_org, actor_id=actor.id,
                        action_type=action, metadata_data={"target_user_id": str(user_id), "reason": reason}))
                    self.db.add(AuditLog(organization_id=target_org, actor_user_id=actor.id,
                        action_type=action, resource_type="user", resource_id=user_id,
                        old_state={"is_active": before, "version": expected},
                        new_state={**output, "acting_organization_id": str(actor_org),
                                   "target_organization_id": str(target_org)},
                        change_diff={"reason": reason}, correlation_id=correlation_id, is_sensitive=True))
                    # Receipt belongs to the acting platform tenant, not the customer.
                    await self.db.flush()
                    async with TenantContextGuard.scoped(self.db, actor_org):
                        await complete_idempotent(self.db, receipt, response_status=200,
                            response_body=output, resource_id=target.id)
                    await self.db.commit()
                    return output
        except Exception:
            await self.db.rollback()
            raise

    async def update_platform_role(self, *, user_id, actor: User, platform_role: str, reason: str,
                                   expected: int, idempotency_key: str) -> dict:
        try:
            from app.core.tenant_context import TenantContextGuard
            from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
            from app.modules.rbac.services.access_foundation import lock_revision, check_version
            from app.modules.rbac.services.platform_permissions import platform_permission_authority, PLATFORM_ROLES
            if platform_role not in {*PLATFORM_ROLES, "NONE"}:
                raise HTTPException(422, detail={"code": "INVALID_PLATFORM_ROLE"})
            if not isinstance(reason, str) or not 12 <= len(reason.strip()) <= 1000:
                raise HTTPException(422, detail={"code": "AUDIT_REASON_REQUIRED"})
            reason = reason.strip()
            if type(expected) is not int or expected < 1:
                raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
            actor_org = await self.db.scalar(select(User.organization_id).where(
                User.id == actor.id, User.deleted_at.is_(None), User.is_active.is_(True)))
            if actor_org is None:
                raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
            async with TenantContextGuard.scoped(self.db, actor_org):
                revision = await lock_revision(self.db, actor_org, write=True)
                # Recheck after the serialising lock, before receipt/resource locks.
                await platform_permission_authority(self.db, actor.id, "platform:administration:manage")
                receipt = await begin_idempotent(self.db, organization_id=actor_org, actor_id=actor.id,
                    operation="platform.identity.role.update", key=idempotency_key,
                    payload={"user_id": str(user_id), "platform_role": platform_role,
                             "version": expected, "reason": reason})
                replay = replay_response(receipt)
                if replay is not None:
                    await self.db.commit()
                    return replay[1]
                target = await self.db.scalar(select(User).where(User.id == user_id,
                    User.organization_id == actor_org, User.deleted_at.is_(None)).with_for_update()
                    .execution_options(populate_existing=True))
                if target is None:
                    raise HTTPException(status_code=404, detail={"code": "RESOURCE_NOT_FOUND"})
                check_version(target.version, expected)
                next_role = None if platform_role == "NONE" else platform_role
                if target.id == actor.id and next_role != "SUPER_ADMIN":
                    raise HTTPException(status_code=409, detail={
                        "code": "SELF_DEMOTION_FORBIDDEN",
                        "message": "Use a separate Super Admin account to change this administrator role.",
                    })
                old_role = target.platform_role
                if old_role == "SUPER_ADMIN" and target.is_active and next_role != "SUPER_ADMIN":
                    owners = await self.db.scalar(select(func.count(User.id)).where(
                        User.organization_id == actor_org, User.platform_role == "SUPER_ADMIN",
                        User.is_active.is_(True), User.deleted_at.is_(None)))
                    if owners <= 1:
                        raise HTTPException(409, detail={"code": "FINAL_PLATFORM_ADMIN_REQUIRED"})
                target.platform_role = next_role
                target.version += 1
                target.auth_revision += 1
                revision.revision += 1
                correlation_id = uuid.uuid4()
                result = await self.db.execute(
                    update(RefreshToken)
                    .where(RefreshToken.user_id == user_id, RefreshToken.is_revoked.is_(False))
                    .values(is_revoked=True, revoked_reason="PLATFORM_ROLE_CHANGED")
                )
                revoked_sessions = int(result.rowcount or 0)
                self.db.add(AuditLog(
                    organization_id=target.organization_id,
                    actor_user_id=actor.id,
                    action_type="USER_PLATFORM_ROLE_CHANGED",
                    resource_type="user",
                    resource_id=user_id,
                    old_state={"platform_role": old_role},
                    new_state={"platform_role": next_role, "version": target.version,
                        "policy_revision": revision.revision, "sessions_revoked": revoked_sessions,
                        "acting_organization_id": str(actor_org), "target_organization_id": str(target.organization_id)},
                    change_diff={"reason": reason},
                    correlation_id=correlation_id,
                    is_sensitive=True,
                ))
                output = {"platform_role": next_role, "version": target.version,
                    "policy_revision": revision.revision, "sessions_revoked": revoked_sessions,
                    "correlation_id": str(correlation_id)}
                await complete_idempotent(self.db, receipt, response_status=200, response_body=output, resource_id=target.id)
                await self.db.commit()
                return output
        except Exception:
            await self.db.rollback()
            raise
