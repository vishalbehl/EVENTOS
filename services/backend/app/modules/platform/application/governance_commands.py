"""Transaction-owning privileged governance commands."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.organization_console import (
    OrganizationLegalHold,
    OrganizationPrivacyRequest,
    OrganizationRetentionPolicy,
    OrganizationComplianceControl,
    OrganizationComplianceEvidence,
)


class OrganizationGovernanceCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _control_dict(row) -> dict:
        return {
            "id": row.id, "organization_id": row.organization_id,
            "framework": row.framework, "control_key": row.control_key,
            "title": row.title, "owner_user_id": row.owner_user_id,
            "applicability": row.applicability, "state": row.state,
            "readiness_score": row.readiness_score,
            "review_due_at": row.review_due_at, "version": row.version,
            "created_at": row.created_at, "updated_at": row.updated_at,
        }

    @staticmethod
    def _evidence_dict(row) -> dict:
        return {
            "id": row.id, "organization_id": row.organization_id,
            "control_id": row.control_id, "evidence_type": row.evidence_type,
            "storage_reference": row.storage_reference,
            "checksum_sha256": row.checksum_sha256,
            "classification": row.classification, "collected_at": row.collected_at,
            "expires_at": row.expires_at, "reviewer_user_id": row.reviewer_user_id,
            "created_at": row.created_at,
        }

    async def create_privacy_request(self, *, organization_id, actor, request_type: str,
                                     subject_reference: str, due_at: datetime,
                                     assigned_to, reason: str, case_reference: str | None) -> dict:
        try:
            if due_at <= datetime.now(timezone.utc):
                raise HTTPException(status_code=422, detail="Privacy request due_at must be in the future")
            if assigned_to:
                assignee = await self.db.scalar(select(User.id).where(
                    User.id == assigned_to,
                    or_(User.organization_id == organization_id, User.is_platform_admin.is_(True)),
                ))
                if assignee is None:
                    raise HTTPException(status_code=404, detail="Privacy request assignee not found")
            row = OrganizationPrivacyRequest(
                organization_id=organization_id, request_type=request_type,
                subject_reference_hash=hashlib.sha256(subject_reference.strip().lower().encode()).hexdigest(),
                due_at=due_at, assigned_to=assigned_to,
            )
            self.db.add(row)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_privacy_request",
                resource_id=row.id, action_type="PRIVACY_REQUEST_CREATED",
                new_state={"request_type": row.request_type,
                           "due_at": row.due_at.isoformat(),
                           "assigned_to": row.assigned_to, "case_reference": case_reference,
                           "reason": reason}, is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "status": row.status, "due_at": row.due_at, "version": row.version}
        except Exception:
            await self.db.rollback()
            raise

    async def update_privacy_request(self, *, organization_id, privacy_request_id,
                                     actor, status_value: str, version: int,
                                     result_reference: str | None, reason: str,
                                     case_reference: str | None) -> dict:
        try:
            row = await self.db.scalar(select(OrganizationPrivacyRequest).where(
                OrganizationPrivacyRequest.id == privacy_request_id,
                OrganizationPrivacyRequest.organization_id == organization_id,
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Privacy request not found")
            if row.version != version:
                raise HTTPException(status_code=412, detail="Privacy request version is stale")
            allowed = {
                "RECEIVED": {"IDENTITY_VERIFIED", "REJECTED"},
                "IDENTITY_VERIFIED": {"IN_PROGRESS", "REJECTED"},
                "IN_PROGRESS": {"COMPLETED", "BLOCKED_BY_HOLD", "REJECTED"},
                "BLOCKED_BY_HOLD": {"IN_PROGRESS", "REJECTED"},
            }
            if status_value != row.status and status_value not in allowed.get(row.status, set()):
                raise HTTPException(status_code=409, detail=f"Invalid privacy request transition from {row.status} to {status_value}")
            if status_value == "COMPLETED" and row.request_type == "ERASURE":
                hold = await self.db.scalar(select(OrganizationLegalHold.id).where(
                    OrganizationLegalHold.organization_id == organization_id,
                    OrganizationLegalHold.status == "ACTIVE",
                ))
                row.legal_hold_checked_at = datetime.now(timezone.utc)
                if hold:
                    raise HTTPException(status_code=409, detail="An active legal hold blocks completion of this erasure request")
            old_status = row.status
            row.status = status_value
            row.result_reference = result_reference
            now = datetime.now(timezone.utc)
            if status_value == "IDENTITY_VERIFIED":
                row.identity_verified_at = now
            if status_value == "COMPLETED":
                row.completed_at = now
            row.version = int(row.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_privacy_request",
                resource_id=row.id, action_type="PRIVACY_REQUEST_UPDATED",
                old_state={"status": old_status, "version": version},
                new_state={"status": row.status, "version": row.version,
                           "case_reference": case_reference, "reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "status": row.status, "version": row.version, "completed_at": row.completed_at}
        except Exception:
            await self.db.rollback()
            raise

    async def upsert_retention_policy(self, *, organization_id, actor, data_category: str,
                                      retention_days: int, disposition_action: str,
                                      is_enabled: bool, version: int | None,
                                      reason: str) -> dict:
        """Create or update one policy inside the application transaction."""
        try:
            row = await self.db.scalar(select(OrganizationRetentionPolicy).where(
                OrganizationRetentionPolicy.organization_id == organization_id,
                OrganizationRetentionPolicy.data_category == data_category,
            ).with_for_update())
            old = None
            if row:
                if version is None or row.version != version:
                    raise HTTPException(status_code=412, detail="Retention policy version is stale")
                old = {
                    "retention_days": row.retention_days,
                    "disposition_action": row.disposition_action,
                    "is_enabled": row.is_enabled,
                    "version": row.version,
                }
                row.retention_days = retention_days
                row.disposition_action = disposition_action
                row.is_enabled = is_enabled
                row.version = int(row.version or 1) + 1
            else:
                if version not in {None, 1}:
                    raise HTTPException(status_code=412, detail="Retention policy does not exist at the requested version")
                row = OrganizationRetentionPolicy(
                    organization_id=organization_id,
                    data_category=data_category,
                    retention_days=retention_days,
                    disposition_action=disposition_action,
                    is_enabled=is_enabled,
                )
                self.db.add(row)
                await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id,
                actor_user_id=actor.id,
                actor_role=actor.role,
                resource_type="organization_retention_policy",
                resource_id=row.id,
                action_type="RETENTION_POLICY_UPSERTED",
                old_state=old,
                new_state={
                    "data_category": row.data_category,
                    "retention_days": row.retention_days,
                    "disposition_action": row.disposition_action,
                    "is_enabled": row.is_enabled,
                    "version": row.version,
                    "reason": reason,
                },
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "version": row.version}
        except Exception:
            await self.db.rollback()
            raise

    async def create_legal_hold(self, *, organization_id, actor, name: str, scope: dict,
                                reason: str, starts_at: datetime | None,
                                ends_at: datetime | None) -> dict:
        try:
            effective_start = starts_at or datetime.now(timezone.utc)
            if ends_at and ends_at <= effective_start:
                raise HTTPException(status_code=422, detail="Legal hold ends_at must follow starts_at")
            row = OrganizationLegalHold(
                organization_id=organization_id, name=name, scope=scope, reason=reason,
                starts_at=effective_start, ends_at=ends_at, approved_by=actor.id,
            )
            self.db.add(row)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_legal_hold",
                resource_id=row.id, action_type="LEGAL_HOLD_CREATED",
                new_state={"name": row.name, "scope": row.scope,
                           "starts_at": row.starts_at.isoformat(),
                           "ends_at": row.ends_at.isoformat() if row.ends_at else None},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "status": row.status}
        except Exception:
            await self.db.rollback()
            raise

    async def release_legal_hold(self, *, organization_id, hold_id, actor, reason: str) -> dict:
        try:
            row = await self.db.scalar(select(OrganizationLegalHold).where(
                OrganizationLegalHold.id == hold_id,
                OrganizationLegalHold.organization_id == organization_id,
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Legal hold not found")
            if row.status != "ACTIVE":
                raise HTTPException(status_code=409, detail="Legal hold is not active")
            row.status = "RELEASED"
            row.ends_at = datetime.now(timezone.utc)
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_legal_hold",
                resource_id=row.id, action_type="LEGAL_HOLD_RELEASED",
                old_state={"status": "ACTIVE"},
                new_state={"status": row.status,
                           "ends_at": row.ends_at.isoformat() if row.ends_at else None,
                           "reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "status": row.status, "ends_at": row.ends_at}
        except Exception:
            await self.db.rollback()
            raise

    async def create_compliance_control(self, *, organization_id, actor, values: dict) -> dict:
        try:
            owner_id = values.get("owner_user_id")
            if owner_id:
                owner = await self.db.scalar(select(User.id).where(
                    User.id == owner_id, User.organization_id == organization_id,
                ))
                if owner is None:
                    raise HTTPException(status_code=404, detail="Control owner not found")
            row = OrganizationComplianceControl(organization_id=organization_id, **values)
            self.db.add(row)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_compliance_control",
                resource_id=row.id, action_type="COMPLIANCE_CONTROL_CREATED",
                new_state={"framework": row.framework, "control_key": row.control_key,
                           "state": row.state}, is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "version": row.version, "state": row.state}
        except Exception:
            await self.db.rollback()
            raise

    async def update_compliance_control(self, *, organization_id, control_id, actor,
                                        values: dict, if_match: int, reason: str) -> dict:
        try:
            row = await self.db.scalar(select(OrganizationComplianceControl).where(
                OrganizationComplianceControl.id == control_id,
                OrganizationComplianceControl.organization_id == organization_id,
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Compliance control not found")
            if row.version != if_match:
                raise HTTPException(status_code=409, detail="VERSION_CONFLICT")
            owner_id = values.get("owner_user_id")
            if owner_id:
                owner = await self.db.scalar(select(User.id).where(
                    User.id == owner_id, User.organization_id == organization_id,
                ))
                if owner is None:
                    raise HTTPException(status_code=404, detail="Control owner not found")
            old = self._control_dict(row)
            for key, value in values.items():
                setattr(row, key, value)
            row.version = int(row.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_compliance_control",
                resource_id=row.id, action_type="COMPLIANCE_CONTROL_UPDATED",
                old_state={"version": old["version"], "state": old["state"]},
                new_state={"version": row.version, "state": row.state, "reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return self._control_dict(row)
        except Exception:
            await self.db.rollback()
            raise

    async def create_compliance_evidence(self, *, organization_id, control_id, actor,
                                         values: dict, reason: str) -> dict:
        try:
            control = await self.db.scalar(select(OrganizationComplianceControl.id).where(
                OrganizationComplianceControl.id == control_id,
                OrganizationComplianceControl.organization_id == organization_id,
            ))
            if control is None:
                raise HTTPException(status_code=404, detail="Compliance control not found")
            reviewer_id = values.get("reviewer_user_id")
            if reviewer_id:
                reviewer = await self.db.scalar(select(User.id).where(
                    User.id == reviewer_id, User.organization_id == organization_id,
                ))
                if reviewer is None:
                    raise HTTPException(status_code=404, detail="Evidence reviewer not found")
            row = OrganizationComplianceEvidence(
                organization_id=organization_id, control_id=control_id, **values,
            )
            self.db.add(row)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_compliance_evidence",
                resource_id=row.id, action_type="COMPLIANCE_EVIDENCE_ATTACHED",
                new_state={"control_id": str(control_id), "evidence_type": row.evidence_type,
                           "checksum_sha256": row.checksum_sha256, "reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return self._evidence_dict(row)
        except Exception:
            await self.db.rollback()
            raise
