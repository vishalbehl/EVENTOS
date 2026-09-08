"""Transaction-owning commands for organiser organization settings."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.core.cache import invalidate_organization
from app.modules.platform.models.organization import Organization
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response


class OrganizerOrganizationCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update_profile(self, *, organization_id, actor, values: dict, if_match: int, idempotency_key: str | None = None) -> Organization:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    self.db, organization_id=organization_id, actor_id=actor.id,
                    operation="organiser.organization.profile.update", key=idempotency_key,
                    payload={"values": values, "if_match": if_match},
                )
                if replay_response(idem) is not None:
                    organization = await self.db.scalar(
                        select(Organization).where(Organization.id == organization_id).with_for_update()
                    )
                    if organization is None:
                        raise RuntimeError("Completed organization idempotency resource is missing.")
                    await self.db.commit()
                    return organization
            organization = await self.db.scalar(select(Organization).where(
                Organization.id == organization_id,
            ).with_for_update())
            if organization is None:
                raise HTTPException(status_code=404, detail="Organization not found")
            if organization.profile_version != if_match:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                    "code": "VERSION_CONFLICT",
                    "current_version": organization.profile_version,
                })
            old = self._snapshot(organization)
            for key, value in values.items():
                setattr(organization, key, value)
            organization.profile_version = int(organization.profile_version or 1) + 1
            organization.profile_updated_by = actor.id
            self.db.add(AuditLog(
                organization_id=organization.id,
                actor_user_id=actor.id,
                actor_role=actor.role,
                resource_type="organization_profile",
                resource_id=organization.id,
                action_type="ORGANIZATION_PROFILE_UPDATED",
                old_state=old,
                new_state={**values, "version": organization.profile_version},
                is_sensitive=True,
            ))
            if idem is not None:
                await complete_idempotent(
                    self.db, idem, response_status=200,
                    response_body=self._snapshot(organization), resource_id=organization.id,
                )
            await self.db.commit()
            await invalidate_organization(organization_id)
            await self.db.refresh(organization)
            return organization
        except Exception:
            await self.db.rollback()
            raise

    @staticmethod
    def _snapshot(organization: Organization) -> dict:
        return {
            "id": str(organization.id), "name": organization.name,
            "legal_name": organization.legal_name, "registration_number": organization.registration_number,
            "organization_type": organization.organization_type, "industry": organization.industry,
            "billing_email": organization.billing_email, "contact_email": organization.contact_email,
            "contact_phone": organization.contact_phone, "website_url": organization.website_url,
            "billing_address": organization.billing_address or {}, "portal_name": organization.portal_name,
            "country": organization.country, "timezone": organization.timezone,
            "language": organization.language, "date_format": organization.date_format,
            "time_format": organization.time_format, "currency": organization.currency,
            "logo_url": organization.logo_url, "primary_color": organization.primary_color,
            "secondary_color": organization.secondary_color, "version": organization.profile_version,
        }
