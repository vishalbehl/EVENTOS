"""Transaction-owning billing profile commands for the organiser portal."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.billing_domain_tables import OrganizationBillingProfile
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response


class OrganizerBillingCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update_profile(self, *, organization_id, actor, values: dict, expected_version: int, idempotency_key: str | None = None) -> OrganizationBillingProfile:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    self.db, organization_id=organization_id, actor_id=actor.id,
                    operation="organiser.organization.billing.update", key=idempotency_key,
                    payload={"values": values, "if_match": expected_version},
                )
                if replay_response(idem) is not None:
                    profile = await self.db.scalar(select(OrganizationBillingProfile).where(
                        OrganizationBillingProfile.organization_id == organization_id
                    ).with_for_update())
                    if profile is None:
                        raise RuntimeError("Completed billing idempotency resource is missing.")
                    await self.db.commit()
                    return profile
            profile = await self.db.scalar(select(OrganizationBillingProfile).where(
                OrganizationBillingProfile.organization_id == organization_id,
            ).with_for_update())
            current_version = profile.version if profile else 0
            if current_version != expected_version:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                    "code": "VERSION_CONFLICT", "current_version": current_version,
                })
            old_state = None if profile is None else {
                "billing_name": profile.billing_name, "billing_email": profile.billing_email,
                "billing_phone": profile.billing_phone, "gst_number": profile.gst_number,
                "country": profile.country, "currency": profile.currency,
                "version": profile.version,
            }
            if profile is None:
                profile = OrganizationBillingProfile(
                    organization_id=organization_id, updated_by=actor.id, **values,
                )
                self.db.add(profile)
            else:
                for key, value in values.items():
                    setattr(profile, key, value)
                profile.updated_by = actor.id
                profile.version = int(profile.version or 0) + 1
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_billing_profile",
                resource_id=profile.id, action_type="ORGANIZATION_BILLING_PROFILE_UPDATED",
                old_state=old_state, new_state={**values, "version": profile.version},
                is_sensitive=True,
            ))
            if idem is not None:
                await complete_idempotent(
                    self.db, idem, response_status=200,
                    response_body={**values, "id": str(profile.id), "version": profile.version},
                    resource_id=profile.id,
                )
            await self.db.commit()
            await invalidate_organization(organization_id)
            return profile
        except Exception:
            await self.db.rollback()
            raise
