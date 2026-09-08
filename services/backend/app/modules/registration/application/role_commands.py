from __future__ import annotations

import uuid
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_service
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.billing.services.usage_reservation_service import UsageReservationService


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
    ) -> ParticipantRole:
        idem = None
        try:
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
                if idem.resource_id is None:
                    raise RuntimeError("Completed role idempotency record has no resource.")
                existing = await db.scalar(
                    select(ParticipantRole).where(
                        ParticipantRole.id == idem.resource_id,
                        ParticipantRole.event_id == event_id,
                    )
                )
                if existing is None:
                    raise RuntimeError("Completed role idempotency resource is missing.")
                await db.commit()
                await db.refresh(existing)
                return existing

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
            response = {
                "id": str(role.id),
                "category": role.category,
                "name": role.name,
                "role_code": role.role_code,
                "is_active": role.is_active,
                "is_default": role.is_default,
                "sort_order": role.sort_order,
            }
            await complete_idempotent(
                db,
                idem,
                response_status=201,
                response_body=response,
                resource_id=role.id,
            )
            await db.commit()
            await _invalidate_role_cache(organization_id, event_id)
            await db.refresh(role)
            return role
        except Exception:
            await db.rollback()
            raise

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
    ) -> ParticipantRole:
        idem = None
        try:
            payload = {
                "event_id": str(event_id),
                "role_id": str(role_id),
                "payload": {"role_code": role_code, "is_active": is_active},
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
                    existing = await db.scalar(select(ParticipantRole).where(ParticipantRole.id == idem.resource_id, ParticipantRole.event_id == event_id))
                    if existing is None:
                        raise RuntimeError("Completed role idempotency resource is missing.")
                    await db.commit()
                    return existing

            role = await db.scalar(select(ParticipantRole).where(ParticipantRole.id == role_id, ParticipantRole.event_id == event_id))
            if role is None:
                raise HTTPException(status_code=404, detail="Role not found.")
            if role_code is not None:
                code = role_code.strip().upper()
                if len(code) < 2:
                    raise HTTPException(status_code=400, detail="Role code must be at least 2 characters.")
                role.role_code = code[:10]
            if is_active is not None:
                role.is_active = is_active
            await db.flush()
            if idem is not None:
                await complete_idempotent(db, idem, response_status=200, response_body={"id": str(role.id), "role_code": role.role_code, "is_active": role.is_active}, resource_id=role.id)
            await db.commit()
            await _invalidate_role_cache(organization_id, event_id)
            await db.refresh(role)
            return role
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def delete(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        role_id: uuid.UUID,
        actor_id: uuid.UUID,
        idempotency_key: Optional[str],
    ) -> dict:
        idem = None
        try:
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=organization_id,
                    actor_id=actor_id,
                    operation="registration.role.delete",
                    key=idempotency_key,
                    payload={"event_id": str(event_id), "role_id": str(role_id)},
                )
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return replay[1] or {"message": "Role deleted."}

            role = await db.scalar(select(ParticipantRole).where(ParticipantRole.id == role_id, ParticipantRole.event_id == event_id))
            if role is None:
                raise HTTPException(status_code=404, detail="Role not found.")
            await db.delete(role)
            response = {"message": "Role deleted."}
            if idem is not None:
                await complete_idempotent(db, idem, response_status=200, response_body=response, resource_id=role_id)
            await db.commit()
            await _invalidate_role_cache(organization_id, event_id)
            return response
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def bulk_toggle(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        actor_id: Optional[uuid.UUID],
        updates: Sequence[dict],
        idempotency_key: Optional[str],
    ) -> dict:
        """Apply role toggles with one bounded read instead of an N+1 loop."""
        idem = None
        try:
            if actor_id is not None and idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=organization_id,
                    actor_id=actor_id,
                    operation="registration.role.bulk_toggle",
                    key=idempotency_key,
                    payload={"event_id": str(event_id), "updates": list(updates)},
                )
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return replay[1] or {"message": "Roles updated successfully."}

            parsed_updates: dict[uuid.UUID, dict] = {}
            for update in updates:
                parsed_updates[uuid.UUID(str(update["id"]))] = update

            if parsed_updates:
                result = await db.execute(
                    select(ParticipantRole).where(
                        ParticipantRole.id.in_(parsed_updates),
                        ParticipantRole.event_id == event_id,
                    )
                )
                roles = result.scalars().all()
                for role in roles:
                    update = parsed_updates[role.id]
                    role.is_active = bool(update.get("is_active", True))
                    if update.get("role_code"):
                        role.role_code = str(update["role_code"]).strip().upper()[:10]

            response = {"message": "Roles updated successfully."}
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body=response,
                )
            await db.commit()
            await _invalidate_role_cache(organization_id, event_id)
            return response
        except Exception:
            await db.rollback()
            raise
