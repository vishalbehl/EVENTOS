"""Transaction-owning administrative identity commands."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.subscription import ActivityTimeline
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User
from app.modules.identity.models.identity_domain_tables import MfaDevice
from app.modules.identity.services.auth_service import revoke_user_refresh_tokens


class IdentityAdminCommandService:
    """Perform administrative session changes atomically."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def force_logout(self, *, user_id, actor: User, reason: str) -> int:
        try:
            target = await self.db.scalar(select(User).where(User.id == user_id).with_for_update())
            if target is None:
                raise HTTPException(status_code=404, detail="User not found")
            result = await self.db.execute(
                update(RefreshToken)
                .where(RefreshToken.user_id == user_id, RefreshToken.is_revoked.is_(False))
                .values(is_revoked=True, revoked_reason="FORCE_LOGOUT_BY_ADMIN")
            )
            self.db.add(AuditLog(
                organization_id=target.organization_id,
                actor_user_id=actor.id,
                action_type="USER_SESSIONS_REVOKED",
                resource_type="user",
                resource_id=user_id,
                old_state={"active_sessions_revoked": result.rowcount},
                new_state={"active_sessions": 0},
                change_diff={"reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            return int(result.rowcount or 0)
        except Exception:
            await self.db.rollback()
            raise

    async def reset_2fa(self, *, user_id, actor: User, reason: str) -> None:
        try:
            target = await self.db.scalar(select(User).where(User.id == user_id).with_for_update())
            if target is None:
                raise HTTPException(status_code=404, detail="User not found")
            was_enabled = bool(target.is_2fa_enabled)
            target.is_2fa_enabled = False
            target.two_factor_secret = None
            await self.db.execute(delete(MfaDevice).where(MfaDevice.user_id == user_id))
            await revoke_user_refresh_tokens(self.db, user_id, reason="admin_mfa_reset")
            self.db.add(AuditLog(
                organization_id=target.organization_id,
                actor_user_id=actor.id,
                action_type="USER_MFA_RESET",
                resource_type="user",
                resource_id=user_id,
                old_state={"is_2fa_enabled": was_enabled},
                new_state={"is_2fa_enabled": False, "sessions_revoked": True},
                change_diff={"reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

    async def update_status(self, *, user_id, actor: User, is_active: bool, reason: str) -> int:
        try:
            target = await self.db.scalar(select(User).where(User.id == user_id).with_for_update())
            if target is None:
                raise HTTPException(status_code=404, detail="User not found")
            if target.id == actor.id and not is_active:
                raise HTTPException(status_code=409, detail={
                    "code": "SELF_DEACTIVATION_FORBIDDEN",
                    "message": "Use a separate privileged account to deactivate this administrator.",
                })
            old_active = target.is_active
            target.is_active = is_active
            revoked_sessions = 0
            if not is_active:
                result = await self.db.execute(
                    update(RefreshToken)
                    .where(RefreshToken.user_id == user_id, RefreshToken.is_revoked.is_(False))
                    .values(is_revoked=True, revoked_reason="USER_DEACTIVATED_BY_ADMIN")
                )
                revoked_sessions = int(result.rowcount or 0)
            action = "USER_ACTIVATED" if is_active else "USER_DEACTIVATED"
            self.db.add(ActivityTimeline(
                organization_id=target.organization_id,
                actor_id=actor.id,
                action_type=action,
                metadata_data={"target_user_id": str(user_id), "target_email": target.email, "reason": reason, "by": str(actor.id)},
            ))
            self.db.add(AuditLog(
                organization_id=target.organization_id,
                actor_user_id=actor.id,
                action_type=action,
                resource_type="user",
                resource_id=user_id,
                old_state={"is_active": old_active},
                new_state={"is_active": is_active, "sessions_revoked": revoked_sessions},
                change_diff={"reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            return revoked_sessions
        except Exception:
            await self.db.rollback()
            raise

    async def update_platform_role(self, *, user_id, actor: User, platform_role: str, reason: str) -> tuple[str | None, int]:
        try:
            target = await self.db.scalar(select(User).where(User.id == user_id).with_for_update())
            if target is None:
                raise HTTPException(status_code=404, detail="User not found")
            next_role = None if platform_role == "NONE" else platform_role
            if target.id == actor.id and next_role != "SUPER_ADMIN":
                raise HTTPException(status_code=409, detail={
                    "code": "SELF_DEMOTION_FORBIDDEN",
                    "message": "Use a separate Super Admin account to change this administrator role.",
                })
            old_role = target.platform_role
            target.platform_role = next_role
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
                new_state={"platform_role": next_role, "sessions_revoked": revoked_sessions},
                change_diff={"reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            return next_role, revoked_sessions
        except Exception:
            await self.db.rollback()
            raise
