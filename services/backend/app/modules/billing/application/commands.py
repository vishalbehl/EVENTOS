from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.services.capability_service import CapabilityService
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.platform_domain_tables import (
    PlatformFlagDefinition,
    PlatformFlagMutation,
    PlatformFlagOverride,
)
from app.modules.billing.services.activation_service import ActivationService


class PlatformFlagCommandService:
    """Own capability-flag mutations and their transaction boundary."""

    @staticmethod
    def _request_hash(operation: str, payload: dict[str, Any]) -> str:
        return hashlib.sha256(
            json.dumps(
                {"operation": operation, **payload},
                sort_keys=True,
                default=str,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()

    @staticmethod
    def _audit(
        actor: User,
        action: str,
        resource_type: str,
        resource_id: uuid.UUID,
        state: dict[str, Any],
        organization_id: uuid.UUID | None = None,
    ) -> AuditLog:
        return AuditLog(
            organization_id=organization_id,
            actor_user_id=actor.id,
            resource_type=resource_type,
            resource_id=resource_id,
            action_type=action,
            actor_role=actor.role,
            new_state=jsonable_encoder(state),
            is_sensitive=True,
            occurred_at=datetime.now(timezone.utc),
        )

    @staticmethod
    def _flag_row(row: PlatformFlagDefinition) -> dict[str, Any]:
        return jsonable_encoder(
            {column.name: getattr(row, column.name) for column in row.__table__.columns}
        )

    @staticmethod
    async def _replay(
        db: AsyncSession,
        *,
        idempotency_key: str,
        request_hash: str,
    ) -> PlatformFlagMutation | None:
        existing = await db.scalar(
            select(PlatformFlagMutation).where(
                PlatformFlagMutation.idempotency_key == idempotency_key
            )
        )
        if existing and existing.request_hash != request_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "IDEMPOTENCY_CONFLICT"},
            )
        return existing

    @staticmethod
    async def _validate_target_capabilities(
        db: AsyncSession, keys: list[str]
    ) -> None:
        known = set(
            (
                await db.scalars(
                    select(FeatureCatalog.key).where(FeatureCatalog.is_active.is_(True))
                )
            ).all()
        )
        unknown = sorted(set(keys) - known)
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "UNKNOWN_CAPABILITY_KEYS", "keys": unknown},
            )

    @staticmethod
    async def sync_catalogue(db: AsyncSession, actor: User) -> dict[str, Any]:
        result = await CapabilityService.sync_catalogue(db)
        audit_id = uuid.uuid4()
        db.add(
            PlatformFlagCommandService._audit(
                actor,
                "CAPABILITY_CATALOGUE_SYNCED",
                "capability_catalogue",
                audit_id,
                result,
            )
        )
        await db.commit()
        return result

    @staticmethod
    async def create_flag(
        db: AsyncSession,
        *,
        payload,
        actor: User,
        idempotency_key: str,
    ) -> dict[str, Any]:
        request_hash = PlatformFlagCommandService._request_hash(
            "CREATE_FLAG", payload.model_dump(mode="json")
        )
        replay = await PlatformFlagCommandService._replay(
            db, idempotency_key=idempotency_key, request_hash=request_hash
        )
        if replay:
            return replay.response_json
        if await db.scalar(
            select(PlatformFlagDefinition.id).where(
                PlatformFlagDefinition.flag_key == payload.flag_key
            )
        ):
            raise HTTPException(status_code=409, detail="Flag key already exists")
        if payload.flag_type == "KILL_SWITCH" and payload.default_value.get("value") is not False:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "SAFE_DEFAULT_REQUIRED",
                    "message": "Kill switches must be created disabled and activated through a dual-approved override.",
                },
            )
        await PlatformFlagCommandService._validate_target_capabilities(
            db, payload.target_capabilities
        )
        values = payload.model_dump(exclude={"reason"})
        row = PlatformFlagDefinition(**values, created_by=actor.id, updated_by=actor.id)
        db.add(row)
        await db.flush()
        db.add(
            PlatformFlagCommandService._audit(
                actor,
                "PLATFORM_FLAG_CREATED",
                "platform_flag",
                row.id,
                {**values, "reason": payload.reason},
            )
        )
        response_json = PlatformFlagCommandService._flag_row(row)
        db.add(
            PlatformFlagMutation(
                flag_id=row.id,
                operation_type="CREATE",
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                response_json=response_json,
                requested_by=actor.id,
            )
        )
        await db.commit()
        return response_json

    @staticmethod
    async def update_flag(
        db: AsyncSession,
        *,
        flag_id: uuid.UUID,
        payload,
        expected_version: int,
        actor: User,
        idempotency_key: str,
    ) -> dict[str, Any]:
        request_hash = PlatformFlagCommandService._request_hash(
            "UPDATE_FLAG",
            {
                "flag_id": str(flag_id),
                "expected_version": expected_version,
                "payload": payload.model_dump(mode="json"),
            },
        )
        replay = await PlatformFlagCommandService._replay(
            db, idempotency_key=idempotency_key, request_hash=request_hash
        )
        if replay:
            return replay.response_json
        row = await db.scalar(
            select(PlatformFlagDefinition)
            .where(PlatformFlagDefinition.id == flag_id)
            .with_for_update()
        )
        if not row:
            raise HTTPException(status_code=404, detail="Flag not found")
        if row.version != expected_version:
            raise HTTPException(
                status_code=409,
                detail={"code": "VERSION_CONFLICT", "current_version": row.version},
            )
        requested = payload.model_dump(exclude_unset=True, exclude={"reason"})
        if "target_capabilities" in requested:
            await PlatformFlagCommandService._validate_target_capabilities(
                db, requested["target_capabilities"] or []
            )
        starts_at = requested.get("starts_at", row.starts_at)
        expires_at = requested.get("expires_at", row.expires_at)
        if starts_at and expires_at and expires_at <= starts_at:
            raise HTTPException(
                status_code=422,
                detail={"code": "INVALID_FLAG_SCHEDULE", "message": "expires_at must follow starts_at"},
            )
        if (
            row.flag_type == "KILL_SWITCH"
            or row.risk_level in {"HIGH", "CRITICAL"}
        ) and any(
            key in requested
            for key in {"rollout_percentage", "is_active", "starts_at", "expires_at"}
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "DUAL_APPROVAL_REQUIRED",
                    "message": "High-risk rollout changes must use a GLOBAL scoped override and independent approval.",
                },
            )
        old = {
            "rollout_percentage": row.rollout_percentage,
            "is_active": row.is_active,
            "expires_at": row.expires_at.isoformat() if row.expires_at else None,
            "version": row.version,
        }
        for key, value in requested.items():
            setattr(row, key, value)
        row.version += 1
        row.updated_by = actor.id
        row.updated_at = datetime.now(timezone.utc)
        db.add(
            PlatformFlagCommandService._audit(
                actor,
                "PLATFORM_FLAG_UPDATED",
                "platform_flag",
                row.id,
                {"old": old, "reason": payload.reason, "version": row.version},
            )
        )
        response_json = PlatformFlagCommandService._flag_row(row)
        db.add(
            PlatformFlagMutation(
                flag_id=row.id,
                operation_type="UPDATE",
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                response_json=response_json,
                requested_by=actor.id,
            )
        )
        await db.commit()
        return response_json

    @staticmethod
    async def request_override(
        db: AsyncSession,
        *,
        flag_id: uuid.UUID,
        payload,
        actor: User,
        idempotency_key: str,
    ) -> dict[str, Any]:
        definition = await db.get(PlatformFlagDefinition, flag_id)
        if not definition:
            raise HTTPException(status_code=404, detail="Flag not found")
        PlatformFlagCommandService._validate_flag_value(definition, payload.value)
        await PlatformFlagCommandService._validate_flag_scope(db, payload)
        request_hash = PlatformFlagCommandService._request_hash(
            "REQUEST_FLAG_OVERRIDE",
            {"flag_id": str(flag_id), "payload": payload.model_dump(mode="json")},
        )
        existing = await db.scalar(
            select(PlatformFlagOverride).where(
                PlatformFlagOverride.idempotency_key == idempotency_key
            )
        )
        if existing:
            if existing.request_hash != request_hash:
                raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
            return {"id": existing.id, "status": existing.status}
        row = PlatformFlagOverride(
            flag_id=flag_id,
            created_by=actor.id,
            status="PENDING",
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            **payload.model_dump(),
        )
        db.add(row)
        await db.flush()
        db.add(
            PlatformFlagCommandService._audit(
                actor,
                "PLATFORM_FLAG_OVERRIDE_REQUESTED",
                "platform_flag_override",
                row.id,
                {"flag_id": str(flag_id), "scope_type": row.scope_type, "case_reference": row.case_reference},
                row.organization_id,
            )
        )
        await db.commit()
        return {"id": row.id, "status": row.status}

    @staticmethod
    async def decide_override(
        db: AsyncSession,
        *,
        override_id: uuid.UUID,
        payload,
        actor: User,
        idempotency_key: str,
    ) -> dict[str, Any]:
        request_hash = PlatformFlagCommandService._request_hash(
            "DECIDE_FLAG_OVERRIDE",
            {"override_id": str(override_id), "payload": payload.model_dump(mode="json")},
        )
        replay = await PlatformFlagCommandService._replay(
            db, idempotency_key=idempotency_key, request_hash=request_hash
        )
        if replay:
            return replay.response_json
        row = await db.scalar(
            select(PlatformFlagOverride)
            .where(PlatformFlagOverride.id == override_id)
            .with_for_update()
        )
        if not row or row.status != "PENDING":
            raise HTTPException(status_code=409, detail="Pending flag override not found")
        if row.created_by == actor.id:
            raise HTTPException(status_code=409, detail="Requester cannot approve their own flag override")
        row.status = payload.decision
        row.approved_by = actor.id
        row.decided_at = datetime.now(timezone.utc)
        row.version += 1
        db.add(
            PlatformFlagCommandService._audit(
                actor,
                f"PLATFORM_FLAG_OVERRIDE_{payload.decision}",
                "platform_flag_override",
                row.id,
                {"reason": payload.reason},
                row.organization_id,
            )
        )
        response_json = jsonable_encoder(
            {"id": row.id, "status": row.status, "version": row.version}
        )
        db.add(
            PlatformFlagMutation(
                flag_id=row.flag_id,
                override_id=row.id,
                operation_type="DECISION",
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                response_json=response_json,
                requested_by=actor.id,
            )
        )
        await db.commit()
        return response_json

    @staticmethod
    def _validate_flag_value(definition: PlatformFlagDefinition, value: dict[str, Any]) -> None:
        if set(value) != {"value"}:
            raise HTTPException(status_code=422, detail={"code": "INVALID_FLAG_VALUE", "message": "Flag value must contain only the value field."})
        raw = value.get("value")
        if definition.value_type == "BOOLEAN" and type(raw) is not bool:
            raise HTTPException(status_code=422, detail={"code": "INVALID_FLAG_VALUE", "message": "This flag requires a Boolean value."})
        if definition.value_type == "VARIANT" and (not isinstance(raw, str) or not raw.strip() or len(raw) > 200):
            raise HTTPException(status_code=422, detail={"code": "INVALID_FLAG_VALUE", "message": "This flag requires a non-empty string variant."})

    @staticmethod
    async def _validate_flag_scope(db: AsyncSession, payload) -> None:
        if payload.organization_id and not await db.get(Organization, payload.organization_id):
            raise HTTPException(status_code=404, detail={"code": "ORGANIZATION_NOT_FOUND"})
        if payload.event_id:
            event = await db.get(Event, payload.event_id)
            if not event or event.organization_id != payload.organization_id:
                raise HTTPException(status_code=404, detail={"code": "EVENT_NOT_FOUND"})
        if payload.user_id and not await db.get(User, payload.user_id):
            raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND"})


class BillingActivationCommandService:
    """Own activation mutations while preserving the mature domain service."""

    @staticmethod
    async def activate(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        subscription_id: uuid.UUID | None,
        grant_id: uuid.UUID | None,
        activation_policy: str,
        idempotency_key: str,
        actor_id: uuid.UUID,
    ):
        try:
            result = await ActivationService.activate_event(
                db,
                organization_id=organization_id,
                event_id=event_id,
                subscription_id=subscription_id,
                grant_id=grant_id,
                activation_policy=activation_policy,
                idempotency_key=idempotency_key,
                actor_id=actor_id,
            )
            await db.commit()
            return result
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def deactivate(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        idempotency_key: str,
        actor_id: uuid.UUID,
    ):
        try:
            result = await ActivationService.deactivate_event(
                db,
                organization_id=organization_id,
                event_id=event_id,
                idempotency_key=idempotency_key,
                actor_id=actor_id,
            )
            await db.commit()
            return result
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def transfer(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        source_event_id: uuid.UUID,
        target_event_id: uuid.UUID,
        idempotency_key: str,
        actor_id: uuid.UUID,
    ):
        try:
            result = await ActivationService.transfer_activation(
                db,
                organization_id=organization_id,
                source_event_id=source_event_id,
                target_event_id=target_event_id,
                idempotency_key=idempotency_key,
                actor_id=actor_id,
            )
            await db.commit()
            return result
        except Exception:
            await db.rollback()
            raise
