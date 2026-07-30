from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.billing.services.usage_reservation_service import (
    UsageReservationService,
)
from app.modules.events.models.event import Event
from app.modules.platform.services.metering_service import MeteringService
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.schemas.participant import ParticipantCreate, ParticipantUpdate
from app.modules.registration.services.portal_service import phone_numbers_match
from app.modules.registration.services.pricing_service import (
    get_active_prices_for_event,
)


class EventParticipantMutationService:
    """Canonical participant writes shared by Organizer Portal and Command Center.

    The caller owns the transaction so the domain mutation, usage ledger, and
    portal-specific audit record can be committed atomically.
    """

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        event: Event,
        payload: ParticipantCreate,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
    ) -> tuple[Participant, bool, str]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "registration.manage",
            user_id=actor_user_id,
        )
        # Serialise duplicate checks, registration-number allocation, and the
        # entitlement reservation for this event.
        await db.scalar(
            select(Event.id).where(Event.id == event.id).with_for_update()
        )

        active = list(
            (
                await db.scalars(
                    select(Participant)
                    .options(selectinload(Participant.role_rel))
                    .where(
                        Participant.event_id == event.id,
                        Participant.deleted_at.is_(None),
                    )
                )
            ).all()
        )
        normalized_email = EventParticipantMutationService._normalize_email(
            payload.email
        )
        if normalized_email and EventParticipantMutationService._email_owner(
            active, normalized_email
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This email address is already registered.",
            )

        profile_match = EventParticipantMutationService._profile_match(
            active, payload.name or "", payload.phone
        )
        if profile_match is not None:
            if not payload.confirm_merge:
                masked = EventParticipantMutationService._mask_email(
                    profile_match.email
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "PROFILE_MERGE_REQUIRED",
                        "message": (
                            "An existing profile with the same name and phone "
                            f"was found under the email {masked}."
                        ),
                        "existing_participant_id": str(profile_match.id),
                        "masked_email": masked,
                    },
                )
            if normalized_email:
                custom = dict(profile_match.custom_fields or {})
                additional = {
                    str(value).strip().lower()
                    for value in custom.get("additional_emails", [])
                    if value
                }
                additional.add(normalized_email)
                custom["additional_emails"] = sorted(additional)
                profile_match.custom_fields = custom
                profile_match.updated_at = datetime.now(timezone.utc)
            is_free = await EventParticipantMutationService._is_free(
                db, event, profile_match.role
            )
            return profile_match, is_free, "MERGED"

        payment_enabled, prices = await EventParticipantMutationService._pricing(
            db, event
        )
        role_obj = await EventParticipantMutationService._resolve_role(
            db, event.id, payload.role_id, payload.role
        )
        role_name = role_obj.name if role_obj else payload.role or "Delegate"
        role_price = prices.get(role_name, 0.0) if payment_enabled else 0.0
        paid_status = payload.paid_status
        if role_price <= 0:
            paid_status = "Paid"

        regno = payload.regno
        if not regno and (role_price <= 0 or paid_status == "Paid"):
            regno = await EventParticipantMutationService._next_regno(
                db, event.id, role_name
            )

        reservation = await UsageReservationService.reserve(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            limit_key="max_registrations",
            quantity=1,
            unit="registration",
            idempotency_key=f"participant-create:{idempotency_key}",
            metadata={"email": normalized_email, "source": source},
        )
        participant = Participant(
            event_id=event.id,
            regno=regno,
            first_name=payload.first_name or "",
            last_name=payload.last_name or "",
            email=normalized_email,
            phone=payload.phone,
            role_id=role_obj.id if role_obj else None,
            role_rel=role_obj,
            company=payload.company,
            designation=payload.designation,
            country=payload.country,
            paid_status=paid_status,
            source=payload.source,
            custom_fields=payload.custom_fields or {},
        )
        db.add(participant)
        await db.flush()
        await UsageReservationService.consume(
            db,
            reservation.id,
            source=f"{source}.participants.create",
            actor_user_id=actor_user_id,
        )
        return participant, (not payment_enabled or role_price <= 0), "CREATED"

    @staticmethod
    async def update(
        db: AsyncSession,
        *,
        event: Event,
        participant_id: uuid.UUID,
        payload: ParticipantUpdate,
        actor_user_id: uuid.UUID,
    ) -> tuple[Participant, bool, dict[str, Any], dict[str, Any]]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "registration.manage",
            user_id=actor_user_id,
        )
        changes = payload.model_dump(exclude_unset=True)
        if "paid_status" in changes:
            await enforce_event_operation(
                db,
                event.organization_id,
                event.id,
                "registration.payments.manage",
                user_id=actor_user_id,
            )
        participant = await EventParticipantMutationService._participant(
            db,
            event.id,
            participant_id,
            include_archived=False,
            lock=True,
        )
        old = {
            field: EventParticipantMutationService._json_value(
                getattr(participant, field, None)
            )
            for field in changes
        }

        if "email" in changes:
            changes["email"] = EventParticipantMutationService._normalize_email(
                changes["email"]
            )
            if changes["email"]:
                active = list(
                    (
                        await db.scalars(
                            select(Participant).where(
                                Participant.event_id == event.id,
                                Participant.id != participant.id,
                                Participant.deleted_at.is_(None),
                            )
                        )
                    ).all()
                )
                if EventParticipantMutationService._email_owner(
                    active, changes["email"]
                ):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Another active participant already uses this email.",
                    )

        old_role = participant.role or "Delegate"
        next_role = old_role
        role_changed = False
        if "role_id" in changes or "role" in changes:
            requested_role_id = (
                changes.get("role_id")
                if "role_id" in changes
                else None
            )
            role_obj = await EventParticipantMutationService._resolve_role(
                db,
                event.id,
                requested_role_id,
                changes.get("role", old_role),
            )
            next_role = role_obj.name if role_obj else "Delegate"
            role_changed = (
                await EventParticipantMutationService._role_prefix(
                    db, event.id, old_role
                )
                != await EventParticipantMutationService._role_prefix(
                    db, event.id, next_role
                )
            )
            participant.role_id = role_obj.id if role_obj else None
            participant.role_rel = role_obj

        for field, value in changes.items():
            if field not in {"role", "role_id"}:
                setattr(participant, field, value)

        payment_enabled, prices = await EventParticipantMutationService._pricing(
            db, event
        )
        role_price = prices.get(next_role, 0.0) if payment_enabled else 0.0
        protected_payment_states = {
            "Cancelled",
            "Canceled",
            "Refunded",
            "Refund Requested",
            "Pending Refund",
        }
        if role_price <= 0 and participant.paid_status not in protected_payment_states:
            participant.paid_status = "Paid"
        if role_changed and "regno" not in changes:
            participant.regno = await EventParticipantMutationService._next_regno(
                db, event.id, next_role
            )
        if participant.paid_status == "Paid" and not participant.regno:
            participant.regno = await EventParticipantMutationService._next_regno(
                db, event.id, next_role
            )
        participant.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return participant, (not payment_enabled or role_price <= 0), changes, old

    @staticmethod
    async def archive(
        db: AsyncSession,
        *,
        event: Event,
        participant_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        source: str,
    ) -> tuple[Participant, str]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "registration.manage",
            user_id=actor_user_id,
        )
        participant = await EventParticipantMutationService._participant(
            db, event.id, participant_id, include_archived=True, lock=True
        )
        if participant.deleted_at is not None:
            return participant, "ALREADY_ARCHIVED"
        participant.deleted_at = datetime.now(timezone.utc)
        participant.deleted_by = actor_user_id
        await MeteringService.record(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            metric_key="registrations",
            quantity=-1,
            unit="registration",
            source=f"{source}.participants.archive",
            idempotency_key=(
                f"participant-archive:{participant.id}:"
                f"{participant.deleted_at.isoformat()}"
            ),
            actor_user_id=actor_user_id,
            metadata={"resource_id": str(participant.id)},
        )
        return participant, "SOFT_DELETED"

    @staticmethod
    async def restore(
        db: AsyncSession,
        *,
        event: Event,
        participant_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
    ) -> tuple[Participant, str]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "registration.manage",
            user_id=actor_user_id,
        )
        participant = await EventParticipantMutationService._participant(
            db, event.id, participant_id, include_archived=True, lock=True
        )
        if participant.deleted_at is None:
            return participant, "ALREADY_ACTIVE"
        normalized_email = EventParticipantMutationService._normalize_email(
            participant.email
        )
        if normalized_email:
            active = list(
                (
                    await db.scalars(
                        select(Participant).where(
                            Participant.event_id == event.id,
                            Participant.id != participant.id,
                            Participant.deleted_at.is_(None),
                        )
                    )
                ).all()
            )
            if EventParticipantMutationService._email_owner(active, normalized_email):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An active participant now uses this archived email.",
                )
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            limit_key="max_registrations",
            quantity=1,
            unit="registration",
            idempotency_key=f"participant-restore:{idempotency_key}",
            metadata={"resource_id": str(participant.id), "source": source},
        )
        participant.deleted_at = None
        participant.deleted_by = None
        participant.updated_at = datetime.now(timezone.utc)
        await UsageReservationService.consume(
            db,
            reservation.id,
            source=f"{source}.participants.restore",
            actor_user_id=actor_user_id,
        )
        return participant, "RESTORED"

    @staticmethod
    async def _participant(
        db: AsyncSession,
        event_id: uuid.UUID,
        participant_id: uuid.UUID,
        *,
        include_archived: bool,
        lock: bool,
    ) -> Participant:
        filters = [
            Participant.id == participant_id,
            Participant.event_id == event_id,
        ]
        if not include_archived:
            filters.append(Participant.deleted_at.is_(None))
        statement = (
            select(Participant)
            .options(selectinload(Participant.role_rel))
            .where(*filters)
        )
        if lock:
            statement = statement.with_for_update()
        participant = await db.scalar(statement)
        if participant is None:
            raise HTTPException(status_code=404, detail="Participant not found.")
        return participant

    @staticmethod
    async def _pricing(
        db: AsyncSession, event: Event
    ) -> tuple[bool, dict[str, float]]:
        payment_enabled = bool(
            (event.registration_settings or {}).get("payment_enabled", False)
        )
        prices = (
            await get_active_prices_for_event(db, event) if payment_enabled else {}
        )
        return payment_enabled, prices

    @staticmethod
    async def _is_free(
        db: AsyncSession, event: Event, role_name: str
    ) -> bool:
        enabled, prices = await EventParticipantMutationService._pricing(db, event)
        return not enabled or prices.get(role_name, 0.0) <= 0

    @staticmethod
    async def _resolve_role(
        db: AsyncSession,
        event_id: uuid.UUID,
        role_id: uuid.UUID | None,
        role_name: str | None,
    ) -> ParticipantRole | None:
        if role_id is not None:
            role = await db.scalar(
                select(ParticipantRole).where(
                    ParticipantRole.id == role_id,
                    ParticipantRole.event_id == event_id,
                )
            )
            if role is None:
                raise HTTPException(
                    status_code=422,
                    detail="Participant role does not belong to this event.",
                )
            return role
        if role_name:
            role = await db.scalar(
                select(ParticipantRole).where(
                    ParticipantRole.event_id == event_id,
                    func.lower(ParticipantRole.name)
                    == str(role_name).strip().lower(),
                )
            )
            if role is not None:
                return role
            # Preserve the historical default-role fallback while keeping the
            # effective role event-scoped and deterministic.
            default_role = await db.scalar(
                select(ParticipantRole).where(
                    ParticipantRole.event_id == event_id,
                    ParticipantRole.is_default.is_(True),
                )
            )
            return default_role
        return None

    @staticmethod
    async def _role_prefix(
        db: AsyncSession, event_id: uuid.UUID, role_name: str
    ) -> str:
        configured = await db.scalar(
            select(ParticipantRole.role_code).where(
                ParticipantRole.event_id == event_id,
                ParticipantRole.name == role_name,
            )
        )
        compact = re.sub(r"[^A-Za-z0-9]", "", role_name or "REG").upper()
        return str(configured or compact[:3] or "REG").strip().upper()

    @staticmethod
    async def _next_regno(
        db: AsyncSession, event_id: uuid.UUID, role_name: str
    ) -> str:
        prefix = await EventParticipantMutationService._role_prefix(
            db, event_id, role_name
        )
        regnos = (
            await db.scalars(
                select(Participant.regno).where(
                    Participant.event_id == event_id,
                    Participant.regno.like(f"{prefix}-%"),
                )
            )
        ).all()
        pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$", re.IGNORECASE)
        used = {
            int(match.group(1))
            for value in regnos
            if value and (match := pattern.match(value))
        }
        number = 1
        while number in used:
            number += 1
        return f"{prefix}-{number:04d}"

    @staticmethod
    def _normalize_email(value: str | None) -> str | None:
        normalized = str(value or "").strip().lower()
        return normalized or None

    @staticmethod
    def _email_owner(
        participants: list[Participant], normalized_email: str
    ) -> Participant | None:
        for participant in participants:
            if (
                EventParticipantMutationService._normalize_email(participant.email)
                == normalized_email
            ):
                return participant
            additional = {
                str(value).strip().lower()
                for value in (participant.custom_fields or {}).get(
                    "additional_emails", []
                )
                if value
            }
            if normalized_email in additional:
                return participant
        return None

    @staticmethod
    def _profile_match(
        participants: list[Participant], name: str, phone: str | None
    ) -> Participant | None:
        normalized_name = " ".join(str(name or "").strip().lower().split())
        if not normalized_name or not phone:
            return None
        for participant in participants:
            candidate = " ".join(
                str(participant.name or "").strip().lower().split()
            )
            if candidate == normalized_name and phone_numbers_match(
                phone, participant.phone
            ):
                return participant
        return None

    @staticmethod
    def _mask_email(email: str | None) -> str:
        local, separator, domain = str(email or "").partition("@")
        if not separator:
            return "***"
        return f"{local[:2]}***@{domain}"

    @staticmethod
    def _json_value(value: Any) -> Any:
        if isinstance(value, uuid.UUID):
            return str(value)
        return value
