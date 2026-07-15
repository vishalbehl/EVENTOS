from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, TypeVar

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.crm.models.core import Account, Contact, Lead
from app.modules.crm.models.crm_domain_tables import Activity, CrmOperationRequest, Note, Opportunity, PipelineStage, Task
from app.modules.platform.support_access import PlatformSupportScope
from app.modules.rbac.models.organization_member import OrganizationMember


RecordT = TypeVar("RecordT", Account, Contact, Lead, Opportunity, Activity, Task, Note)


MODEL_TYPES: dict[str, type[Any]] = {
    "account": Account,
    "contact": Contact,
    "lead": Lead,
    "opportunity": Opportunity,
    "activity": Activity,
    "task": Task,
    "note": Note,
}


def _fingerprint(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _snapshot(record: Any) -> dict[str, Any]:
    fields = (
        "id", "organization_id", "name", "status", "email", "account_id", "contact_id", "stage_id", "amount",
        "entity_type", "entity_id", "activity_type", "description", "occurred_at", "subject", "due_date",
        "assigned_to", "completed_at", "content", "version", "archived_at",
    )
    result: dict[str, Any] = {}
    for field in fields:
        value = getattr(record, field, None)
        if value is None:
            continue
        if isinstance(value, uuid.UUID):
            value = str(value)
        elif isinstance(value, datetime):
            value = value.isoformat()
        elif isinstance(value, Decimal):
            value = float(value)
        result[field] = value
    return result


class CrmLifecycleService:
    REQUIRED_FIELDS: dict[str, set[str]] = {
        "account": {"name"},
        "contact": {"account_id", "first_name", "last_name", "email"},
        "lead": {"status"},
        "opportunity": {"account_id", "stage_id", "name", "amount"},
        "activity": {"entity_type", "entity_id", "activity_type", "occurred_at"},
        "task": {"entity_type", "entity_id", "subject", "status"},
        "note": {"entity_type", "entity_id", "content"},
    }

    @staticmethod
    async def _begin_operation(
        db: AsyncSession,
        organization_id: uuid.UUID,
        operation_type: str,
        idempotency_key: str,
        payload: dict[str, Any],
    ) -> tuple[CrmOperationRequest, bool]:
        request_hash = _fingerprint(payload)
        existing = await db.scalar(
            select(CrmOperationRequest).where(
                CrmOperationRequest.organization_id == organization_id,
                CrmOperationRequest.operation_type == operation_type,
                CrmOperationRequest.idempotency_key == idempotency_key,
            ).with_for_update()
        )
        if existing:
            if existing.request_hash != request_hash:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "IDEMPOTENCY_CONFLICT", "message": "The idempotency key was already used with a different request."})
            if existing.status == "SUCCEEDED" and existing.result_ref_id:
                return existing, True
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "OPERATION_IN_PROGRESS", "message": "The operation has not reached a replayable terminal state."})
        operation = CrmOperationRequest(
            organization_id=organization_id,
            operation_type=operation_type,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            status="PENDING",
        )
        db.add(operation)
        await db.flush()
        return operation, False

    @staticmethod
    async def _load_record(db: AsyncSession, model: type[RecordT], organization_id: uuid.UUID, record_id: uuid.UUID, *, lock: bool = False) -> RecordT:
        statement = select(model).where(model.organization_id == organization_id, model.id == record_id)
        if lock:
            statement = statement.with_for_update()
        record = await db.scalar(statement)
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CRM resource not found.")
        return record

    @staticmethod
    async def _validate_reference(db: AsyncSession, model: type[Any], organization_id: uuid.UUID, record_id: uuid.UUID, label: str) -> None:
        record = await db.scalar(select(model).where(model.organization_id == organization_id, model.id == record_id, model.archived_at.is_(None)))
        if record is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "INVALID_CRM_REFERENCE", "message": f"{label} does not belong to the selected organization or is archived."})

    @staticmethod
    async def _validate_contact_email(db: AsyncSession, organization_id: uuid.UUID, email: str, current_id: uuid.UUID | None = None) -> None:
        statement = select(Contact.id).where(
            Contact.organization_id == organization_id,
            Contact.email == email.strip().lower(),
        )
        if current_id:
            statement = statement.where(Contact.id != current_id)
        if await db.scalar(statement):
            raise HTTPException(status_code=409, detail={"code": "CRM_CONTACT_EMAIL_EXISTS", "message": "A contact with this email already exists in the organization."})

    @staticmethod
    async def _validate_entity_reference(db: AsyncSession, organization_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID) -> None:
        if entity_type == "organization":
            if entity_id != organization_id:
                raise HTTPException(status_code=422, detail={"code": "INVALID_CRM_REFERENCE", "message": "Organization-scoped engagement must reference the selected organization."})
            return
        model = MODEL_TYPES.get(entity_type)
        if model not in {Account, Contact, Lead, Opportunity}:
            raise HTTPException(status_code=422, detail={"code": "INVALID_CRM_ENTITY_TYPE"})
        await CrmLifecycleService._validate_reference(db, model, organization_id, entity_id, entity_type.title())

    @staticmethod
    async def _validate_assignee(db: AsyncSession, organization_id: uuid.UUID, user_id: uuid.UUID | None) -> None:
        if user_id is None:
            return
        member = await db.scalar(select(OrganizationMember.id).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user_id,
            OrganizationMember.is_active.is_(True),
        ))
        if member is None:
            raise HTTPException(status_code=422, detail={"code": "INVALID_CRM_ASSIGNEE", "message": "Task assignee must be an active member of the selected organization."})

    @staticmethod
    async def _validate_required_update_values(resource_type: str, values: dict[str, Any]) -> None:
        invalid = CrmLifecycleService.REQUIRED_FIELDS[resource_type].intersection(
            key for key, value in values.items() if value is None
        )
        if invalid:
            raise HTTPException(status_code=422, detail={"code": "INVALID_CRM_VALUE", "message": f"Required fields cannot be null: {', '.join(sorted(invalid))}."})

    @staticmethod
    async def _audit(db: AsyncSession, scope: PlatformSupportScope, record: Any, action: str, reason: str, old_state: dict[str, Any] | None = None) -> None:
        db.add(AuditLog(
            request_id=scope.request_id,
            correlation_id=scope.correlation_id,
            organization_id=scope.organization_id,
            actor_user_id=scope.actor.id,
            resource_type=f"crm_{record.__tablename__}",
            resource_id=record.id,
            action_type=action,
            actor_role=scope.actor.platform_role or scope.actor.role,
            old_state=old_state,
            new_state={**_snapshot(record), "reason": reason},
            actor_ip=scope.actor_ip,
            actor_user_agent=scope.actor_user_agent,
            is_sensitive=True,
        ))

    @staticmethod
    async def create(db: AsyncSession, scope: PlatformSupportScope, resource_type: str, payload: BaseModel, idempotency_key: str) -> Any:
        model = MODEL_TYPES[resource_type]
        values = payload.model_dump(exclude={"reason"})
        reason = payload.reason
        operation_type = f"CREATE_{resource_type.upper()}"
        async with TenantContextGuard.scoped(db, scope.organization_id):
            operation, replay = await CrmLifecycleService._begin_operation(db, scope.organization_id, operation_type, idempotency_key, payload.model_dump(mode="json"))
            if replay:
                return await CrmLifecycleService._load_record(db, model, scope.organization_id, operation.result_ref_id)
            if resource_type in {"contact", "opportunity"}:
                await CrmLifecycleService._validate_reference(db, Account, scope.organization_id, values["account_id"], "Account")
            if resource_type == "contact":
                values["email"] = values["email"].strip().lower()
                await CrmLifecycleService._validate_contact_email(db, scope.organization_id, values["email"])
            if resource_type == "lead" and values.get("contact_id"):
                await CrmLifecycleService._validate_reference(db, Contact, scope.organization_id, values["contact_id"], "Contact")
            if resource_type == "opportunity":
                stage_exists = await db.scalar(select(PipelineStage.id).where(PipelineStage.id == values["stage_id"]))
                if stage_exists is None:
                    raise HTTPException(status_code=422, detail={"code": "INVALID_CRM_REFERENCE", "message": "Pipeline stage does not exist."})
            if resource_type in {"activity", "task", "note"}:
                await CrmLifecycleService._validate_entity_reference(
                    db, scope.organization_id, values["entity_type"], values["entity_id"]
                )
                values["created_by"] = scope.actor.id
            if resource_type == "task":
                await CrmLifecycleService._validate_assignee(db, scope.organization_id, values.get("assigned_to"))
                if values.get("status") == "COMPLETED":
                    values["completed_at"] = datetime.now(timezone.utc)
            record = model(organization_id=scope.organization_id, **values)
            db.add(record)
            await db.flush()
            operation.status = "SUCCEEDED"
            operation.result_ref_type = resource_type
            operation.result_ref_id = record.id
            await CrmLifecycleService._audit(db, scope, record, f"CRM_{resource_type.upper()}_CREATED", reason)
            await db.commit()
            await db.refresh(record)
            return record

    @staticmethod
    async def update(db: AsyncSession, scope: PlatformSupportScope, resource_type: str, record_id: uuid.UUID, payload: BaseModel, idempotency_key: str) -> Any:
        model = MODEL_TYPES[resource_type]
        reason = payload.reason
        values = payload.model_dump(exclude={"reason", "version"}, exclude_unset=True)
        operation_type = f"UPDATE_{resource_type.upper()}"
        async with TenantContextGuard.scoped(db, scope.organization_id):
            operation, replay = await CrmLifecycleService._begin_operation(db, scope.organization_id, operation_type, idempotency_key, {"record_id": record_id, **payload.model_dump(mode="json")})
            if replay:
                return await CrmLifecycleService._load_record(db, model, scope.organization_id, operation.result_ref_id)
            record = await CrmLifecycleService._load_record(db, model, scope.organization_id, record_id, lock=True)
            if record.archived_at:
                raise HTTPException(status_code=409, detail={"code": "CRM_RESOURCE_ARCHIVED", "message": "Restore the resource before updating it."})
            if record.version != payload.version:
                raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "message": "The CRM resource changed after it was loaded.", "current_version": record.version})
            await CrmLifecycleService._validate_required_update_values(resource_type, values)
            if values.get("account_id"):
                await CrmLifecycleService._validate_reference(db, Account, scope.organization_id, values["account_id"], "Account")
            if resource_type == "lead" and values.get("contact_id"):
                await CrmLifecycleService._validate_reference(db, Contact, scope.organization_id, values["contact_id"], "Contact")
            if resource_type == "contact" and values.get("email"):
                values["email"] = values["email"].strip().lower()
                await CrmLifecycleService._validate_contact_email(db, scope.organization_id, values["email"], record.id)
            if resource_type == "opportunity" and values.get("stage_id"):
                stage_exists = await db.scalar(select(PipelineStage.id).where(PipelineStage.id == values["stage_id"]))
                if stage_exists is None:
                    raise HTTPException(status_code=422, detail={"code": "INVALID_CRM_REFERENCE", "message": "Pipeline stage does not exist."})
            if resource_type == "task" and "assigned_to" in values:
                await CrmLifecycleService._validate_assignee(db, scope.organization_id, values.get("assigned_to"))
            if resource_type == "task" and "status" in values:
                values["completed_at"] = datetime.now(timezone.utc) if values["status"] == "COMPLETED" else None
            old_state = _snapshot(record)
            for key, value in values.items():
                setattr(record, key, value)
            record.version += 1
            record.updated_at = datetime.now(timezone.utc)
            operation.status = "SUCCEEDED"
            operation.result_ref_type = resource_type
            operation.result_ref_id = record.id
            await CrmLifecycleService._audit(db, scope, record, f"CRM_{resource_type.upper()}_UPDATED", reason, old_state)
            await db.commit()
            await db.refresh(record)
            return record

    @staticmethod
    async def set_archived(db: AsyncSession, scope: PlatformSupportScope, resource_type: str, record_id: uuid.UUID, payload: BaseModel, idempotency_key: str, archived: bool) -> Any:
        model = MODEL_TYPES[resource_type]
        action = "ARCHIVE" if archived else "RESTORE"
        operation_type = f"{action}_{resource_type.upper()}"
        async with TenantContextGuard.scoped(db, scope.organization_id):
            operation, replay = await CrmLifecycleService._begin_operation(db, scope.organization_id, operation_type, idempotency_key, {"record_id": record_id, **payload.model_dump(mode="json")})
            if replay:
                return await CrmLifecycleService._load_record(db, model, scope.organization_id, operation.result_ref_id)
            record = await CrmLifecycleService._load_record(db, model, scope.organization_id, record_id, lock=True)
            if record.version != payload.version:
                raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "message": "The CRM resource changed after it was loaded.", "current_version": record.version})
            if archived == bool(record.archived_at):
                raise HTTPException(status_code=409, detail={"code": "INVALID_LIFECYCLE_STATE", "message": f"The CRM resource is already {'archived' if archived else 'active'}."})
            if archived and resource_type == "account":
                dependent = await db.scalar(
                    select(Contact.id).where(Contact.organization_id == scope.organization_id, Contact.account_id == record.id, Contact.archived_at.is_(None)).limit(1)
                ) or await db.scalar(
                    select(Opportunity.id).where(Opportunity.organization_id == scope.organization_id, Opportunity.account_id == record.id, Opportunity.archived_at.is_(None)).limit(1)
                )
                if dependent:
                    raise HTTPException(status_code=409, detail={"code": "CRM_DEPENDENCIES_EXIST", "message": "Archive active contacts and opportunities before archiving this account."})
            if archived and resource_type == "contact":
                dependent = await db.scalar(
                    select(Lead.id).where(Lead.organization_id == scope.organization_id, Lead.contact_id == record.id, Lead.archived_at.is_(None)).limit(1)
                )
                if dependent:
                    raise HTTPException(status_code=409, detail={"code": "CRM_DEPENDENCIES_EXIST", "message": "Archive active leads before archiving this contact."})
            old_state = _snapshot(record)
            record.archived_at = datetime.now(timezone.utc) if archived else None
            record.archived_by = scope.actor.id if archived else None
            record.archive_reason = payload.reason if archived else None
            record.version += 1
            record.updated_at = datetime.now(timezone.utc)
            operation.status = "SUCCEEDED"
            operation.result_ref_type = resource_type
            operation.result_ref_id = record.id
            await CrmLifecycleService._audit(db, scope, record, f"CRM_{resource_type.upper()}_{action}D", payload.reason, old_state)
            await db.commit()
            await db.refresh(record)
            return record

    @staticmethod
    async def convert_lead(
        db: AsyncSession,
        scope: PlatformSupportScope,
        lead_id: uuid.UUID,
        payload: BaseModel,
        idempotency_key: str,
    ) -> Opportunity:
        operation_payload = {"lead_id": lead_id, **payload.model_dump(mode="json")}
        async with TenantContextGuard.scoped(db, scope.organization_id):
            operation, replay = await CrmLifecycleService._begin_operation(
                db, scope.organization_id, "CONVERT_LEAD", idempotency_key, operation_payload
            )
            if replay:
                return await CrmLifecycleService._load_record(
                    db, Opportunity, scope.organization_id, operation.result_ref_id
                )
            lead = await CrmLifecycleService._load_record(db, Lead, scope.organization_id, lead_id, lock=True)
            if lead.archived_at or lead.status == "CONVERTED":
                raise HTTPException(status_code=409, detail={"code": "LEAD_ALREADY_CONVERTED"})
            if lead.version != payload.version:
                raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": lead.version})
            if lead.status != "QUALIFIED" or not lead.contact_id:
                raise HTTPException(
                    status_code=409,
                    detail={"code": "LEAD_NOT_CONVERTIBLE", "message": "Only qualified leads linked to an active contact can be converted."},
                )
            contact = await CrmLifecycleService._load_record(db, Contact, scope.organization_id, lead.contact_id)
            if contact.archived_at:
                raise HTTPException(status_code=409, detail={"code": "LEAD_CONTACT_ARCHIVED"})
            stage_exists = await db.scalar(select(PipelineStage.id).where(PipelineStage.id == payload.stage_id))
            if stage_exists is None:
                raise HTTPException(status_code=422, detail={"code": "INVALID_CRM_REFERENCE", "message": "Pipeline stage does not exist."})

            opportunity = Opportunity(
                organization_id=scope.organization_id,
                account_id=contact.account_id,
                stage_id=payload.stage_id,
                name=payload.opportunity_name,
                amount=payload.amount,
                close_date=payload.close_date,
            )
            db.add(opportunity)
            await db.flush()
            old_state = _snapshot(lead)
            lead.status = "CONVERTED"
            lead.archived_at = datetime.now(timezone.utc)
            lead.archived_by = scope.actor.id
            lead.archive_reason = payload.reason
            lead.version += 1
            lead.updated_at = datetime.now(timezone.utc)
            operation.status = "SUCCEEDED"
            operation.result_ref_type = "opportunity"
            operation.result_ref_id = opportunity.id
            await CrmLifecycleService._audit(db, scope, opportunity, "CRM_OPPORTUNITY_CREATED_FROM_LEAD", payload.reason)
            await CrmLifecycleService._audit(db, scope, lead, "CRM_LEAD_CONVERTED", payload.reason, old_state)
            await db.commit()
            await db.refresh(opportunity)
            return opportunity
