"""Explicit reviewed reconciliation, never a global-role membership backfill."""
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from sqlalchemy import and_, func, or_, select

from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.platform.services.lifecycle_authority import lock_lifecycle_authority
from app.modules.rbac.models.access_foundation import ClientRelationship
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.services.invitations import admission, issue_token


class FoundationRecoveryInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    action: Literal["classification", "legacy_lifecycle", "owner_invitation"]
    organization_kind: Literal["NORMAL", "EMC", "CLIENT"] | None = None
    legacy_state: Literal["SUSPENDED", "ARCHIVED"] | None = None
    owner_email: EmailStr | None = None
    replace_existing_membership: bool = False
    membership_version: int | None = Field(None, ge=1)
    approval_reference: str = Field(min_length=12, max_length=200)
    reason: str = Field(min_length=12, max_length=2000)

    @model_validator(mode="after")
    def selected_decision_only(self):
        supplied = {name for name in ("organization_kind", "legacy_state", "owner_email") if getattr(self, name) is not None}
        if supplied != {dict(classification="organization_kind", legacy_lifecycle="legacy_state", owner_invitation="owner_email")[self.action]}:
            raise ValueError("Provide only the selected recovery decision")
        if self.action != "owner_invitation" and (self.replace_existing_membership or self.membership_version is not None):
            raise ValueError("Membership replacement is only an explicit owner-invitation decision")
        if self.replace_existing_membership != (self.membership_version is not None):
            raise ValueError("Explicit membership replacement requires its displayed version")
        return self


class FoundationRecoveryResult(BaseModel):
    organization_id: uuid.UUID
    organization_kind: Literal["NORMAL", "EMC", "CLIENT"]
    lifecycle_state: Literal["ACTIVE", "SUSPENDED", "ARCHIVED"]
    version: int
    policy_revision: int
    correlation_id: uuid.UUID
    membership_id: uuid.UUID | None = None
    membership_version: int | None = None
    invite_token: str | None = None
    invitation_expires_at: datetime | None = None
    operational_access_granted: Literal[False] = False


async def recover_foundation(db, actor, organization_id, payload, expected, key):
    if type(expected) is not int or expected < 1:
        raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
    if payload.action == "owner_invitation":
        await admission(actor.id, organization_id)
    acting_id, revisions = await lock_lifecycle_authority(db, organization_id, actor.id,
        expected_auth_revision=actor.auth_revision)
    async with TenantContextGuard.scoped(db, organization_id):
        org = await db.scalar(select(Organization).where(Organization.id == organization_id)
            .with_for_update().execution_options(populate_existing=True))
        if org is None or org.is_platform_org:
            raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
        reservation = await begin_idempotent(db, organization_id=organization_id, actor_id=actor.id,
            operation="foundation.reconcile", key=key, payload={**payload.model_dump(mode="json"), "version": expected})
        replay = replay_response(reservation)
        if replay is not None:
            await db.commit()
            return replay[1]
        if org.profile_version != expected:
            raise HTTPException(412, detail={"code": "STALE_VERSION"})
        before = {"organization_kind": org.organization_kind, "lifecycle_state": org.lifecycle_state,
            "version": org.profile_version}
        member = None
        secret = None
        if payload.action == "classification":
            kind = payload.organization_kind
            conflicts = await db.scalar(select(ClientRelationship.id).where(
                ClientRelationship.status.in_(("REQUESTED", "ACTIVE", "SUSPENDED")),
                or_(and_(ClientRelationship.emc_organization_id == organization_id, kind != "EMC"),
                    and_(ClientRelationship.client_organization_id == organization_id, kind != "CLIENT"))).limit(1))
            if conflicts is not None:
                raise HTTPException(409, detail={"code": "RELATIONSHIP_CLASSIFICATION_CONFLICT"})
            org.organization_kind = kind
        elif payload.action == "legacy_lifecycle":
            if org.is_active or org.archived_at is not None or org.suspended_at is not None:
                raise HTTPException(409, detail={"code": "AMBIGUOUS_LEGACY_STATE_REQUIRED"})
            # Never infer archive from unpaid invoices or enable an inactive
            # tenant through reconciliation. Restore remains a separate command.
            if payload.legacy_state == "ARCHIVED":
                org.archived_at = datetime.now(timezone.utc)
            else:
                org.suspended_at = datetime.now(timezone.utc)
                org.suspension_reason = payload.reason
        else:
            if org.lifecycle_state != "ACTIVE":
                raise HTTPException(409, detail={"code": "ACTIVE_ORGANIZATION_REQUIRED"})
            existing_owner = await db.scalar(select(OrganizationMember.id).join(User.__table__, User.__table__.c.id == OrganizationMember.user_id).where(
                OrganizationMember.organization_id == organization_id, OrganizationMember.org_role == "owner",
                OrganizationMember.is_active.is_(True), OrganizationMember.accepted_at.is_not(None),
                User.__table__.c.is_active.is_(True), User.__table__.c.deleted_at.is_(None)).limit(1))
            if existing_owner is not None:
                raise HTTPException(409, detail={"code": "EXISTING_OWNER_TRANSFER_REQUIRED"})
            # Require owner-designation evidence. Still issue only a pending
            # invitation: acceptance must authenticate the designated identity.
            email = str(payload.owner_email).lower()
            member = await db.scalar(select(OrganizationMember).outerjoin(User.__table__, User.__table__.c.id == OrganizationMember.user_id).where(
                OrganizationMember.organization_id == organization_id,
                or_(
                    and_(OrganizationMember.accepted_at.is_(None),
                         func.lower(OrganizationMember.invite_email) == email),
                    and_(OrganizationMember.accepted_at.is_not(None),
                         func.lower(User.__table__.c.email) == email),
                ))
                .with_for_update(of=OrganizationMember).execution_options(populate_existing=True))
            if member is not None and member.accepted_at is not None:
                if not payload.replace_existing_membership:
                    raise HTTPException(409, detail={"code": "EXISTING_MEMBERSHIP_REVIEW_REQUIRED"})
                if member.version != payload.membership_version:
                    raise HTTPException(412, detail={"code": "STALE_MEMBERSHIP_VERSION"})
                before["replaced_membership"] = {"id": str(member.id), "role": member.org_role,
                    "accepted_at": member.accepted_at.isoformat(), "version": member.version, "is_active": member.is_active}
                # Explicitly replace, never silently promote an accepted member.
                # The former membership loses access until identity acceptance.
                member.accepted_at = None
            elif payload.replace_existing_membership:
                raise HTTPException(409, detail={"code": "MEMBERSHIP_REPLACEMENT_STATE_CHANGED"})
            pending_conditions = [
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.org_role == "owner",
                OrganizationMember.is_active.is_(True),
                OrganizationMember.accepted_at.is_(None),
            ]
            if member is not None:
                pending_conditions.append(OrganizationMember.id != member.id)
            other_pending = await db.scalar(
                select(OrganizationMember.id).where(*pending_conditions).limit(1)
            )
            if other_pending is not None:
                raise HTTPException(409, detail={"code": "OWNER_INVITATION_ALREADY_PENDING"})
            if member is None:
                member = OrganizationMember(organization_id=organization_id, user_id=None,
                    org_role="owner", invite_email=str(payload.owner_email).lower(), invited_by=actor.id,
                    accepted_at=None, is_active=True, version=1)
                db.add(member)
            else:
                member.org_role = "owner"; member.is_active = True; member.version += 1
                member.invite_email = email
            secret = issue_token(member)
        org.profile_version += 1
        org.profile_updated_by = actor.id
        revisions[organization_id].revision += 1
        await db.flush()
        correlation = uuid.uuid4()
        result = FoundationRecoveryResult(organization_id=organization_id, organization_kind=org.organization_kind,
            lifecycle_state=org.lifecycle_state, version=org.profile_version,
            policy_revision=revisions[organization_id].revision, correlation_id=correlation,
            membership_id=member.id if member else None, membership_version=member.version if member else None,
            invitation_expires_at=member.invite_expires_at if member else None)
        safe_result = result.model_dump(mode="json")
        db.add(AuditLog(organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
            resource_type="organization", resource_id=organization_id, action_type="FOUNDATION_RECOVERY_REVIEWED",
            old_state=before, new_state={**safe_result, "action": payload.action,
                "acting_organization_id": str(acting_id), "target_organization_id": str(organization_id),
                "approval_reference": payload.approval_reference, "reason": payload.reason},
            correlation_id=correlation, is_sensitive=True))
        await complete_idempotent(db, reservation, response_status=200, response_body=safe_result, resource_id=organization_id)
        await db.commit()
        return {**safe_result, "invite_token": secret}
