from __future__ import annotations

import uuid
import re
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_service
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.events.models.event import Event
from app.core.concurrency import require_if_match
from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.audit.models.audit_log import AuditLog


def role_projection(role: ParticipantRole, event_version: int) -> dict:
    return {"id": str(role.id), "category": role.category, "name": role.name,
        "role_code": role.role_code, "is_active": role.is_active,
        "is_default": role.is_default, "sort_order": role.sort_order,
        "version": int(role.version or 1), "event_version": event_version}


def _validate_patch(role_code, is_active):
    if role_code is not None and (not isinstance(role_code, str) or not re.fullmatch(r"[A-Za-z0-9]{2,10}", role_code)):
        raise HTTPException(422, detail={"code": "INVALID_ROLE_CODE"})
    if is_active is not None and type(is_active) is not bool:
        raise HTTPException(422, detail={"code": "INVALID_ROLE_STATE"})


async def _admit(db, organization_id, event_id, actor_id, key):
    if actor_id is None:
        raise HTTPException(401, detail={"code": "AUTHENTICATION_REQUIRED"})
    if not key:
        raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    if not 16 <= len(key.strip()) <= 160:
        raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
    await enforce_event_operation(db, organization_id, event_id,
        "registration.ticket_types.manage", user_id=actor_id)


async def _locked_event(db, organization_id, event_id, actor_id):
    event = await db.scalar(select(Event).where(Event.id == event_id,
        Event.organization_id == organization_id, Event.deleted_at.is_(None))
        .with_for_update().execution_options(populate_existing=True))
    if event is None:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    await enforce_event_operation(db, organization_id, event_id,
        "registration.ticket_types.manage", user_id=actor_id)
    return event


def _audit(db, event, actor_id, receipt, action, resource_id, before, after):
    selector = db.info.get("customer_request_selector")
    db.add(AuditLog(organization_id=event.organization_id, actor_user_id=actor_id,
        correlation_id=receipt.id, resource_type="participant_role", resource_id=resource_id,
        action_type=action, is_sensitive=True, old_state=before,
        new_state={**after, "workspace_id": str(event.operational_workspace_id),
            "target_organization_id": str(event.organization_id),
            "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or event.organization_id),
            "access_mode": getattr(selector, "access_mode", "DIRECT")}))


async def _invalidate_role_cache(organization_id: uuid.UUID, event_id: uuid.UUID) -> None:
    await cache_service.invalidate_domain("registration_roles", organization_id, event_id)


class ParticipantRoleCommandService:
    """Own role mutation transactions; routers only resolve policy and input."""

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        actor_id: uuid.UUID,
        category: str,
        name: str,
        role_code: str,
        is_active: bool,
        sort_order: int,
        idempotency_key: str,
    ) -> dict:
        idem = None
        try:
            await _admit(db, organization_id, event_id, actor_id, idempotency_key)
            _validate_patch(role_code, is_active)
            if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100 or not isinstance(category, str) or not 1 <= len(category.strip()) <= 100:
                raise HTTPException(422, detail={"code": "INVALID_ROLE_NAME_OR_CATEGORY"})
            name, category = name.strip(), category.strip()
            idem = await begin_idempotent(
                db,
                organization_id=organization_id,
                actor_id=actor_id,
                operation="registration.role.create",
                key=idempotency_key,
                payload={
                    "event_id": str(event_id),
                    "category": category,
                    "name": name,
                    "role_code": role_code,
                    "is_active": is_active,
                    "sort_order": sort_order,
                },
            )
            replay = replay_response(idem)
            if replay is not None:
                if "version" not in replay[1]:
                    raise HTTPException(409, detail={"code": "LEGACY_ROLE_RECEIPT_RELOAD_REQUIRED"})
                await db.commit()
                return replay[1]

            event = await _locked_event(db, organization_id, event_id, actor_id)
            existing_names = list((await db.scalars(select(ParticipantRole.name).where(
                ParticipantRole.event_id == event_id).limit(101))).all())
            if name in existing_names:
                raise HTTPException(409, detail={"code": "PARTICIPANT_ROLE_NAME_CONFLICT"})
            if len(existing_names) >= 100:
                raise HTTPException(409, detail={"code": "ROLE_CONFIGURATION_EXCEEDS_BOUNDS"})

            reservation = await UsageReservationService.reserve(
                db,
                organization_id=organization_id,
                event_id=event_id,
                limit_key="max_ticket_categories",
                quantity=1,
                unit="ticket_category",
                idempotency_key=f"participant-role-create:{idempotency_key}",
                metadata={"name": name, "category": category},
            )
            role = ParticipantRole(
                event_id=event_id,
                category=category,
                name=name,
                role_code=role_code.strip().upper()[:10],
                is_active=is_active,
                is_default=False,
                sort_order=sort_order,
            )
            db.add(role)
            await db.flush()
            await UsageReservationService.consume(
                db,
                reservation.id,
                source="organizer_portal.registration.participant_roles.create",
                actor_user_id=actor_id,
            )
            event.version = int(event.version or 1) + 1
            response = role_projection(role, event.version)
            _audit(db, event, actor_id, idem, "PARTICIPANT_ROLE_CREATED", role.id, None,
                {"version": role.version, "event_version": event.version})
            await complete_idempotent(
                db,
                idem,
                response_status=201,
                response_body=response,
                resource_id=role.id,
            )
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        await _invalidate_role_cache(organization_id, event_id)
        return response

    @staticmethod
    async def update(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        role_id: uuid.UUID,
        actor_id: uuid.UUID,
        role_code: Optional[str],
        is_active: Optional[bool],
        idempotency_key: Optional[str],
        if_match: str | None,
    ) -> dict:
        idem = None
        try:
            await _admit(db, organization_id, event_id, actor_id, idempotency_key)
            _validate_patch(role_code, is_active)
            version = require_if_match(if_match)
            payload = {
                "event_id": str(event_id),
                "role_id": str(role_id),
                "payload": {"role_code": role_code, "is_active": is_active},
                "version": version,
            }
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=organization_id,
                    actor_id=actor_id,
                    operation="registration.role.update",
                    key=idempotency_key,
                    payload=payload,
                )
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return replay[1]

            event = await _locked_event(db, organization_id, event_id, actor_id)
            role = await db.scalar(select(ParticipantRole).where(ParticipantRole.id == role_id,
                ParticipantRole.event_id == event_id).with_for_update().execution_options(populate_existing=True))
            if role is None:
                raise HTTPException(status_code=404, detail="Role not found.")
            if int(role.version or 1) != version:
                raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": role.version})
            before = {"version": role.version, "is_active": role.is_active, "role_code": role.role_code}
            if role_code is not None:
                code = role_code.strip().upper()
                if len(code) < 2:
                    raise HTTPException(status_code=400, detail="Role code must be at least 2 characters.")
                role.role_code = code[:10]
            if is_active is not None:
                role.is_active = is_active
            role.version = version + 1
            event.version = int(event.version or 1) + 1
            await db.flush()
            response = role_projection(role, event.version)
            _audit(db, event, actor_id, idem, "PARTICIPANT_ROLE_UPDATED", role.id, before,
                {"version": role.version, "is_active": role.is_active, "role_code": role.role_code})
            if idem is not None:
                await complete_idempotent(db, idem, response_status=200, response_body=response, resource_id=role.id)
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        await _invalidate_role_cache(organization_id, event_id)
        return response

    @staticmethod
    async def delete(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        role_id: uuid.UUID,
        actor_id: uuid.UUID,
        idempotency_key: Optional[str],
        if_match: str | None,
    ) -> dict:
        idem = None
        try:
            await _admit(db, organization_id, event_id, actor_id, idempotency_key)
            version = require_if_match(if_match)
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=organization_id,
                    actor_id=actor_id,
                    operation="registration.role.delete",
                    key=idempotency_key,
                    payload={"event_id": str(event_id), "role_id": str(role_id), "version": version},
                )
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return replay[1] or {"message": "Role deleted."}

            event = await _locked_event(db, organization_id, event_id, actor_id)
            role = await db.scalar(select(ParticipantRole).where(ParticipantRole.id == role_id,
                ParticipantRole.event_id == event_id).with_for_update().execution_options(populate_existing=True))
            if role is None:
                raise HTTPException(status_code=404, detail="Role not found.")
            if int(role.version or 1) != version:
                raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": role.version})
            if role.is_default:
                raise HTTPException(409, detail={"code": "DEFAULT_ROLE_DELETE_FORBIDDEN"})
            from app.modules.registration.models.participant import Participant
            from app.modules.registration.models.ticket_type import TicketType
            if await db.scalar(select(Participant.id).where(Participant.event_id == event_id,
                Participant.role_id == role_id).limit(1)) or await db.scalar(select(TicketType.id).where(
                    TicketType.event_id == event_id, TicketType.role_name == role.name).limit(1)):
                raise HTTPException(409, detail={"code": "ROLE_IN_USE", "message": "Disable the role instead of deleting its references."})
            await db.delete(role)
            event.version = int(event.version or 1) + 1
            response = {"message": "Role deleted.", "event_version": event.version}
            _audit(db, event, actor_id, idem, "PARTICIPANT_ROLE_DELETED", role_id,
                {"version": version}, {"event_version": event.version})
            if idem is not None:
                await complete_idempotent(db, idem, response_status=200, response_body=response, resource_id=role_id)
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        await _invalidate_role_cache(organization_id, event_id)
        return response

    @staticmethod
    async def bulk_toggle(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        actor_id: Optional[uuid.UUID],
        updates: Sequence[dict],
        idempotency_key: Optional[str],
        if_match: str | None,
    ) -> dict:
        """Apply role toggles with one bounded read instead of an N+1 loop."""
        idem = None
        try:
            await _admit(db, organization_id, event_id, actor_id, idempotency_key)
            version = require_if_match(if_match)
            if not 1 <= len(updates) <= 100:
                raise HTTPException(422, detail={"code": "INVALID_BULK_ROLE_COUNT"})
            if actor_id is not None and idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=organization_id,
                    actor_id=actor_id,
                    operation="registration.role.bulk_toggle",
                    key=idempotency_key,
                    payload={"event_id": str(event_id), "updates": list(updates), "version": version},
                )
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return replay[1] or {"message": "Roles updated successfully."}

            parsed_updates: dict[uuid.UUID, dict] = {}
            for update in updates:
                if set(update) - {"id", "version", "is_active", "role_code"} or type(update.get("version")) is not int or update["version"] < 1:
                    raise HTTPException(422, detail={"code": "INVALID_ROLE_UPDATE"})
                _validate_patch(update.get("role_code"), update.get("is_active"))
                role_id = uuid.UUID(str(update["id"]))
                if role_id in parsed_updates:
                    raise HTTPException(422, detail={"code": "DUPLICATE_ROLE_TARGET"})
                parsed_updates[role_id] = update

            event = await _locked_event(db, organization_id, event_id, actor_id)
            if int(event.version or 1) != version:
                raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": event.version})
            if parsed_updates:
                result = await db.execute(
                    select(ParticipantRole).where(
                        ParticipantRole.id.in_(parsed_updates),
                        ParticipantRole.event_id == event_id,
                    ).order_by(ParticipantRole.id).with_for_update().execution_options(populate_existing=True)
                )
                roles = result.scalars().all()
                if len(roles) != len(parsed_updates):
                    raise HTTPException(404, detail={"code": "ROLE_NOT_FOUND"})
                for role in roles:
                    update = parsed_updates[role.id]
                    if int(role.version or 1) != update["version"]:
                        raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": role.version})
                event.version = version + 1
                for role in roles:
                    update = parsed_updates[role.id]
                    before = {"version": role.version, "role_code": role.role_code, "is_active": role.is_active}
                    if update.get("is_active") is not None:
                        role.is_active = update["is_active"]
                    if update.get("role_code") is not None:
                        role.role_code = update["role_code"].strip().upper()
                    role.version = int(role.version or 1) + 1
                    _audit(db, event, actor_id, idem, "PARTICIPANT_ROLE_UPDATED", role.id, before,
                        {"version": role.version, "role_code": role.role_code, "is_active": role.is_active})

            response = {"message": "Roles updated successfully.", "event_version": event.version,
                "roles": [role_projection(role, event.version) for role in roles]}
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body=response,
                )
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        await _invalidate_role_cache(organization_id, event_id)
        return response
