"""Transaction-owning security-policy commands."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization_console import OrganizationSecurityPolicy


class OrganizerSecurityCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update_policy(self, *, organization_id, actor, values: dict, if_match: int) -> dict:
        try:
            allowed = {"PASSWORD", "TOTP", "SSO"}
            methods = list(dict.fromkeys(method.upper() for method in values["allowed_auth_methods"]))
            if not set(methods).issubset(allowed):
                raise HTTPException(status_code=422, detail={"code": "INVALID_AUTH_METHOD"})
            password_policy = {
                "minimum_length": max(8, min(128, int(values["password_policy"].get("minimum_length", 12)))),
                "require_uppercase": bool(values["password_policy"].get("require_uppercase", True)),
                "require_lowercase": bool(values["password_policy"].get("require_lowercase", True)),
                "require_number": bool(values["password_policy"].get("require_number", True)),
                "require_symbol": bool(values["password_policy"].get("require_symbol", False)),
            }
            session_policy = {
                "idle_timeout_minutes": max(5, min(1440, int(values["session_policy"].get("idle_timeout_minutes", 60)))),
                "maximum_session_hours": max(1, min(720, int(values["session_policy"].get("maximum_session_hours", 24)))),
                "maximum_active_sessions": max(1, min(50, int(values["session_policy"].get("maximum_active_sessions", 5)))),
            }
            trusted_device_policy = {
                "enabled": bool(values["trusted_device_policy"].get("enabled", True)),
                "lifetime_days": max(1, min(365, int(values["trusted_device_policy"].get("lifetime_days", 30)))),
            }
            allowed_cidrs = list(dict.fromkeys(value.strip() for value in values["allowed_cidrs"] if value.strip()))
            row = await self.db.scalar(select(OrganizationSecurityPolicy).where(
                OrganizationSecurityPolicy.organization_id == organization_id,
            ).with_for_update())
            if row and row.version != if_match:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                    "code": "VERSION_CONFLICT", "current_version": row.version,
                })
            if row is None:
                row = OrganizationSecurityPolicy(
                    organization_id=organization_id, require_mfa=values["require_mfa"],
                    allowed_auth_methods=methods, password_policy=password_policy,
                    session_policy=session_policy, trusted_device_policy=trusted_device_policy,
                    sso_enforced=values["sso_enforced"], allowed_cidrs=allowed_cidrs,
                    updated_by=actor.id,
                )
                self.db.add(row)
                await self.db.flush()
            else:
                row.require_mfa = values["require_mfa"]
                row.allowed_auth_methods = methods
                row.password_policy = password_policy
                row.session_policy = session_policy
                row.trusted_device_policy = trusted_device_policy
                row.sso_enforced = values["sso_enforced"]
                row.allowed_cidrs = allowed_cidrs
                row.updated_by = actor.id
                row.version = int(row.version or 1) + 1
            state = {
                "require_mfa": row.require_mfa, "allowed_auth_methods": row.allowed_auth_methods,
                "password_policy": row.password_policy, "session_policy": row.session_policy,
                "trusted_device_policy": row.trusted_device_policy, "sso_enforced": row.sso_enforced,
                "allowed_cidrs": row.allowed_cidrs, "version": row.version,
            }
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="organization_security_policy", resource_id=row.id,
                action_type="ORGANIZATION_SECURITY_POLICY_UPDATED", old_state=None,
                new_state=state, is_sensitive=True,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return state
        except Exception:
            await self.db.rollback()
            raise
