"""Transaction-owning privileged organization security commands."""

from __future__ import annotations

import ipaddress
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization_console import OrganizationSecurityPolicy
from app.modules.platform.models.organization_console import OrganizationTrustedDevice
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User


class OrganizationSecurityCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update_policy(self, *, organization_id, actor, values: dict,
                            if_match: int, reason: str) -> dict:
        try:
            allowed = {"PASSWORD", "TOTP", "SSO"}
            methods = list(dict.fromkeys(method.upper() for method in values["allowed_auth_methods"]))
            if not set(methods).issubset(allowed):
                raise HTTPException(status_code=422, detail={"code": "INVALID_AUTH_METHOD"})
            allowed_cidrs = list(dict.fromkeys(value.strip() for value in values["allowed_cidrs"] if value.strip()))
            for cidr in allowed_cidrs:
                try:
                    ipaddress.ip_network(cidr, strict=False)
                except ValueError as exc:
                    raise HTTPException(status_code=422, detail=f"Invalid CIDR: {cidr}") from exc
            row = await self.db.scalar(select(OrganizationSecurityPolicy).where(
                OrganizationSecurityPolicy.organization_id == organization_id,
            ).with_for_update())
            if row and row.version != if_match:
                raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail="Security policy version is stale")
            if row is None:
                if if_match != 1:
                    raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail="Security policy does not exist at the requested version")
                row = OrganizationSecurityPolicy(
                    organization_id=organization_id, updated_by=actor.id,
                    **{key: value for key, value in values.items() if key != "version"},
                )
                row.allowed_auth_methods = methods
                row.allowed_cidrs = allowed_cidrs
                self.db.add(row)
                await self.db.flush()
                old = None
            else:
                old = {"require_mfa": row.require_mfa, "allowed_auth_methods": row.allowed_auth_methods,
                       "allowed_cidrs": row.allowed_cidrs, "version": row.version}
                for key, value in values.items():
                    if key != "version":
                        setattr(row, key, value)
                row.allowed_auth_methods = methods
                row.allowed_cidrs = allowed_cidrs
                row.version = int(row.version or 1) + 1
                row.updated_by = actor.id
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_security_policy",
                resource_id=row.id, action_type="ORGANIZATION_SECURITY_POLICY_UPDATED",
                old_state=old,
                new_state={"require_mfa": row.require_mfa, "allowed_auth_methods": row.allowed_auth_methods,
                           "allowed_cidrs": row.allowed_cidrs, "version": row.version, "reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "version": row.version, "updated_at": row.updated_at}
        except Exception:
            await self.db.rollback()
            raise

    async def revoke_trusted_device(self, *, organization_id, device_id, actor,
                                    reason: str) -> dict:
        try:
            row = await self.db.scalar(select(OrganizationTrustedDevice).where(
                OrganizationTrustedDevice.id == device_id,
                OrganizationTrustedDevice.organization_id == organization_id,
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Trusted device not found")
            if row.revoked_at is None:
                row.revoked_at = datetime.now(timezone.utc)
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_trusted_device",
                resource_id=row.id, action_type="ORGANIZATION_TRUSTED_DEVICE_REVOKED",
                new_state={"revoked_at": row.revoked_at.isoformat(), "reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "revoked_at": row.revoked_at}
        except Exception:
            await self.db.rollback()
            raise

    async def revoke_all_sessions(self, *, organization_id, actor, reason: str) -> dict:
        try:
            user_ids = select(User.id).where(User.organization_id == organization_id)
            result = await self.db.execute(update(RefreshToken).where(
                RefreshToken.user_id.in_(user_ids), RefreshToken.is_revoked.is_(False),
            ).values(
                is_revoked=True, revoked_at=datetime.now(timezone.utc),
                revoked_reason="organization_security_revocation",
            ))
            count = int(result.rowcount or 0)
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization",
                resource_id=organization_id, action_type="ORGANIZATION_SESSIONS_REVOKED",
                new_state={"sessions_revoked": count, "reason": reason}, is_sensitive=True,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return {"sessions_revoked": count}
        except Exception:
            await self.db.rollback()
            raise
