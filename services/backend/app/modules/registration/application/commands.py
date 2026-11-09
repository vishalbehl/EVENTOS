from __future__ import annotations

import uuid
import hashlib
from datetime import datetime, timezone
from fastapi import HTTPException, status
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_service
from app.core.concurrency import raise_version_conflict, require_if_match
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.events.models.event import Event
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.models.registration_domain_tables import FormField
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.models.promo_code import PromoCode
from app.modules.registration.schemas.registration_form_config import (
    RegistrationFormConfigUpdate,
    RegistrationFormConfigResponse,
)
from app.modules.registration.schemas.registration import (
    ParticipantRegistrationCreate,
    ParticipantRegistrationResponse,
)
from app.modules.registration.schemas.form_builder import (
    FormCategoryCreate,
    FormCategoryUpdate,
    FormCategoryResponse,
    FormTemplateSaveEventCopy,
    FormTemplateCreate,
    FormTemplateUpdate,
    FormTemplateResponse,
)
from app.modules.events.services import EventParticipantMutationService
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.platform.services.metering_service import MeteringService
from app.modules.registration.schemas.participant import (
    ParticipantCreate,
    ParticipantResponse,
    ParticipantUpdate,
)
from app.modules.registration.services.ticket_pricing_service import TicketPricingService
from app.services.credential_cipher import cipher
from app.core.encryption import encrypt as encrypt_credential
from app.modules.analytics.services.projection_dispatch import (
    enqueue_event_registration_projection_refresh,
)
from sqlalchemy.orm import selectinload, raiseload

# Private proof that an enclosing aggregate command already completed the same
# authoritative event-operation admission in the current transaction. PostgreSQL
# revision locks acquired by that admission remain held until commit/rollback.
# A boolean flag would be too easy for an unrelated caller to set accidentally.
_EVENT_COPY_AUTHORIZATION = object()


class PricingCommandService:
    """Own pricing mutations and invalidate event reads after commit."""

    @staticmethod
    async def snapshot(db: AsyncSession, *, event: Event) -> dict:
        from app.modules.rbac.schemas.event import EventResponse
        from app.modules.registration.models.ticket_type import TicketType
        roles = list((await db.scalars(select(ParticipantRole).where(
            ParticipantRole.event_id == event.id).order_by(ParticipantRole.id).limit(101)
            .with_for_update(read=True).execution_options(populate_existing=True))).all())
        tickets = list((await db.scalars(select(TicketType).where(TicketType.event_id == event.id)
            .order_by(TicketType.id).limit(10001).with_for_update(read=True)
            .execution_options(populate_existing=True))).all())
        if len(roles) > 100 or len(tickets) > 10000:
            raise HTTPException(409, detail={"code": "PRICING_CONFIGURATION_EXCEEDS_BOUNDS"})
        settings = event.registration_settings or {}
        tiers = list(dict.fromkeys([*(settings.get("tiers") or []), *(row.tier_name for row in tickets)]))
        if len(tiers) > 100:
            raise HTTPException(409, detail={"code": "PRICING_CONFIGURATION_EXCEEDS_BOUNDS"})
        prices = {f"{row.role_name}_{row.tier_name}": row.price for row in tickets}
        if len(prices) != len(tickets):
            raise HTTPException(409, detail={"code": "AMBIGUOUS_PRICING_KEY"})
        return {"event": EventResponse.model_validate(event).model_dump(mode="json"),
            "version": int(event.version or 1), "tiers": tiers,
            "pricingData": prices,
            "tierSchedules": settings.get("tier_schedules") or {},
            "tierCutoffs": settings.get("tier_cutoffs") or {},
            "roles": [{"id": str(role.id), "name": role.name, "category": role.category,
                "role_code": role.role_code, "is_active": role.is_active,
                "is_default": role.is_default, "sort_order": role.sort_order,
                "version": int(role.version or 1), "event_version": int(event.version or 1)} for role in roles]}

    @staticmethod
    async def configure(db: AsyncSession, *, event: Event, changes: dict, actor,
                        if_match: str | None, idempotency_key: str | None) -> dict:
        from app.core.dependencies.feature_gate import enforce_event_operation
        from app.modules.audit.models.audit_log import AuditLog
        from app.modules.registration.schemas.pricing_configuration import PricingConfigurationUpdate
        from pydantic import ValidationError
        if actor is None:
            raise HTTPException(401, detail={"code": "AUTHENTICATION_REQUIRED"})
        version = require_if_match(if_match)
        if not idempotency_key:
            raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        if not 16 <= len(idempotency_key.strip()) <= 160:
            raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
        organization_id, event_id = event.organization_id, event.id
        try:
            for action in ("registration.ticket_types.manage", "registration.payments.manage"):
                await enforce_event_operation(db, organization_id, event_id, action, user_id=actor.id)
            receipt = await begin_idempotent(db, organization_id=organization_id, actor_id=actor.id,
                operation="registration.pricing.configuration.save", key=idempotency_key,
                payload={"event_id": str(event_id), "version": version, "changes": changes})
            replay = replay_response(receipt)
            if replay is not None:
                await db.commit()
                return replay[1]
            owned = await db.scalar(select(Event).where(Event.id == event_id,
                Event.organization_id == organization_id, Event.deleted_at.is_(None))
                .with_for_update().execution_options(populate_existing=True))
            if owned is None:
                raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
            for action in ("registration.ticket_types.manage", "registration.payments.manage"):
                await enforce_event_operation(db, organization_id, event_id, action, user_id=actor.id)
            current_version = int(owned.version or 1)
            if version != current_version:
                raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": current_version})
            previous = await PricingCommandService.snapshot(db, event=owned)
            combined = {key: changes.get(key, previous[key]) for key in
                ("tiers", "pricingData", "tierSchedules", "tierCutoffs")}
            # Compatibility tier-only updates remove obsolete rows in the same transaction.
            if "tiers" in changes:
                retained = set(changes["tiers"])
                for key in ("tierSchedules", "tierCutoffs"):
                    if key not in changes:
                        combined[key] = {tier: value for tier, value in combined[key].items() if tier in retained}
                if "pricingData" not in changes:
                    allowed_keys = {f"{role['name']}_{tier}" for role in previous["roles"] for tier in retained}
                    combined["pricingData"] = {key: value for key, value in combined["pricingData"].items() if key in allowed_keys}
            try:
                config = PricingConfigurationUpdate.model_validate(combined)
            except ValidationError as exc:
                raise HTTPException(422, detail={"code": "INVALID_PRICING_CONFIGURATION"}) from exc
            pairs = {}
            for role in previous["roles"]:
                for tier in config.tiers:
                    key, pair = f"{role['name']}_{tier}", (role["name"], tier)
                    if key in pairs and pairs[key] != pair:
                        raise HTTPException(409, detail={"code": "AMBIGUOUS_PRICING_KEY"})
                    pairs[key] = pair
            if set(config.pricingData) - pairs.keys():
                raise HTTPException(404, detail={"code": "PRICING_ROLE_OR_TIER_NOT_FOUND"})
            schedules = {tier: config.tierSchedules[tier].model_dump(mode="json")
                if tier in config.tierSchedules else {"available_from": None, "available_until": None}
                for tier in config.tiers}
            for tier, cutoff in config.tierCutoffs.items():
                until = schedules[tier]["available_until"]
                if until is not None and cutoff is not None:
                    from dateutil.parser import isoparse
                    if isoparse(until) != cutoff:
                        raise HTTPException(422, detail={"code": "CONFLICTING_TIER_CUTOFF"})
                if until is None and cutoff is not None:
                    schedules[tier]["available_until"] = cutoff.isoformat()
            # Validate the effective schedule after combining legacy cutoff inputs.
            from app.modules.registration.schemas.pricing_configuration import TierSchedule
            try:
                for schedule in schedules.values():
                    TierSchedule.model_validate(schedule)
            except ValidationError as exc:
                raise HTTPException(422, detail={"code": "INVALID_TIER_WINDOW"}) from exc
            await TicketPricingService.set_tiers(db, owned, config.tiers)
            normalized = await TicketPricingService.replace_matrix(db, owned, config.pricingData, schedules,
                resolved_pairs=pairs, replace_configuration=True)
            owned.version = current_version + 1
            await db.flush()
            from app.modules.rbac.schemas.event import EventResponse
            result = {**previous, "event": EventResponse.model_validate(owned).model_dump(mode="json"),
                "version": owned.version, "tiers": config.tiers, "pricingData": normalized,
                "tierSchedules": schedules, "tierCutoffs": owned.registration_settings["tier_cutoffs"],
                "roles": [{**role, "event_version": owned.version} for role in previous["roles"]]}
            from app.modules.registration.schemas.pricing_configuration import PricingConfigurationResponse
            result = PricingConfigurationResponse.model_validate(result).model_dump(mode="json")
            selector = db.info.get("customer_request_selector")
            db.add(AuditLog(organization_id=organization_id, actor_user_id=actor.id,
                correlation_id=receipt.id, resource_type="event_pricing", resource_id=event_id,
                action_type="EVENT_PRICING_CONFIGURATION_UPDATED", is_sensitive=True,
                old_state={"version": current_version}, new_state={"version": owned.version,
                    "workspace_id": str(owned.operational_workspace_id), "tier_count": len(config.tiers),
                    "price_count": len(config.pricingData), "target_organization_id": str(organization_id),
                    "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or organization_id),
                    "access_mode": getattr(selector, "access_mode", "DIRECT")}))
            await complete_idempotent(db, receipt, response_status=200, response_body=result, resource_id=event_id)
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        await cache_service.invalidate_domain("registration_pricing", organization_id, event_id)
        return result

    @staticmethod
    async def save_tiers(
        db: AsyncSession,
        *,
        event: Event,
        tiers: list[str],
        actor=None,
        if_match: str | None = None,
        idempotency_key: str | None = None,
    ) -> list[str]:
        result = await PricingCommandService.configure(db, event=event, changes={"tiers": tiers},
            actor=actor, if_match=if_match, idempotency_key=idempotency_key)
        return result["tiers"]

    @staticmethod
    async def save_matrix(
        db: AsyncSession,
        *,
        event: Event,
        pricing_data: dict,
        tier_schedules: dict | None = None,
        actor=None,
        if_match: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict:
        changes = {"pricingData": pricing_data}
        if tier_schedules is not None:
            changes["tierSchedules"] = tier_schedules
        result = await PricingCommandService.configure(db, event=event, changes=changes,
            actor=actor, if_match=if_match, idempotency_key=idempotency_key)
        return result["pricingData"]


class RegistrationCommandService:
    """Own registration-submission capacity, idempotency, and transaction state."""

    @staticmethod
    async def submit(
        db: AsyncSession,
        *,
        event: Event,
        payload: ParticipantRegistrationCreate,
        idempotency_key: str | None = None,
    ) -> ParticipantRegistration:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=None,
                    operation="registration.submit",
                    key=idempotency_key,
                    payload={"event_id": str(event.id), "payload": payload.model_dump(mode="json")},
                    ttl_seconds=7 * 24 * 60 * 60,
                )
                replay = replay_response(idem)
                if replay is not None:
                    existing = await db.scalar(
                        select(ParticipantRegistration).where(
                            ParticipantRegistration.id == idem.resource_id,
                            ParticipantRegistration.event_id == event.id,
                        )
                    )
                    if existing is None:
                        raise RuntimeError("Completed registration idempotency resource is missing.")
                    await db.commit()
                    return existing

            rule = await db.scalar(
                select(CapacityRule).where(
                    CapacityRule.event_id == event.id,
                    CapacityRule.session_id.is_(None),
                    CapacityRule.room_id.is_(None),
                )
            )
            current_approved = await db.scalar(
                select(func.count(Participant.id)).where(
                    Participant.event_id == event.id,
                    Participant.deleted_at.is_(None),
                )
            ) or 0
            registration_status = "submitted"
            waitlist_position = None
            if rule and current_approved >= rule.capacity:
                if not rule.waitlist_enabled:
                    raise HTTPException(status_code=400, detail="This event is at full capacity and waitlisting is disabled.")
                max_position = await db.scalar(
                    select(func.max(ParticipantRegistration.waitlist_position)).where(
                        ParticipantRegistration.event_id == event.id,
                        ParticipantRegistration.registration_status == "waitlisted",
                    )
                )
                registration_status = "waitlisted"
                waitlist_position = (max_position or 0) + 1

            registration = ParticipantRegistration(
                event_id=event.id,
                registration_status=registration_status,
                registration_data=payload.registration_data,
                approval_source=payload.approval_source,
                waitlist_position=waitlist_position,
            )
            db.add(registration)
            await db.flush()
            await MeteringService.record(
                db,
                organization_id=event.organization_id,
                event_id=event.id,
                metric_key="registration_submissions",
                quantity=1,
                unit="count",
                source="registration.submit",
                idempotency_key=f"registration-submit:{registration.id}",
                metadata={"registration_id": str(registration.id), "status": registration_status},
            )
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=201,
                    response_body=ParticipantRegistrationResponse.model_validate(registration).model_dump(mode="json"),
                    resource_id=registration.id,
                )
            await db.commit()
            await db.refresh(registration)
            enqueue_event_registration_projection_refresh(
                organization_id=event.organization_id,
                event_id=event.id,
            )
            await cache_service.invalidate_event(event.organization_id, event.id)
            return registration
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def reject(
        db: AsyncSession,
        *,
        event: Event,
        registration_id: uuid.UUID,
        reviewer_id: uuid.UUID,
        rejection_reason: str,
        review_notes: str | None = None,
        idempotency_key: str | None = None,
        expected_version: int | None = None,
    ) -> ParticipantRegistration:
        """Reject a registration in one replay-safe, version-checked transaction."""
        return await RegistrationCommandService._review_transition(
            db,
            event=event,
            registration_id=registration_id,
            reviewer_id=reviewer_id,
            target_status="rejected",
            rejection_reason=rejection_reason,
            review_notes=review_notes,
            idempotency_key=idempotency_key,
            expected_version=expected_version,
        )

    @staticmethod
    async def waitlist(
        db: AsyncSession,
        *,
        event: Event,
        registration_id: uuid.UUID,
        reviewer_id: uuid.UUID,
        idempotency_key: str | None = None,
        expected_version: int | None = None,
    ) -> ParticipantRegistration:
        """Place a registration at the end of the event waitlist."""
        return await RegistrationCommandService._review_transition(
            db,
            event=event,
            registration_id=registration_id,
            reviewer_id=reviewer_id,
            target_status="waitlisted",
            idempotency_key=idempotency_key,
            expected_version=expected_version,
        )

    @staticmethod
    async def _review_transition(
        db: AsyncSession,
        *,
        event: Event,
        registration_id: uuid.UUID,
        reviewer_id: uuid.UUID,
        target_status: str,
        rejection_reason: str | None = None,
        review_notes: str | None = None,
        idempotency_key: str | None = None,
        expected_version: int | None = None,
    ) -> ParticipantRegistration:
        payload = {
            "event_id": str(event.id),
            "registration_id": str(registration_id),
            "target_status": target_status,
            "rejection_reason": rejection_reason,
            "review_notes": review_notes,
            "expected_version": expected_version,
        }
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=reviewer_id,
                    operation=f"registration.{target_status}",
                    key=idempotency_key,
                    payload=payload,
                    ttl_seconds=30 * 24 * 60 * 60,
                )
                replay = replay_response(idem)
                if replay is not None:
                    existing = await db.scalar(
                        select(ParticipantRegistration).where(
                            ParticipantRegistration.id == idem.resource_id,
                            ParticipantRegistration.event_id == event.id,
                        )
                    )
                    if existing is None:
                        raise RuntimeError("Completed registration idempotency resource is missing.")
                    await db.commit()
                    return existing

            reg = await db.scalar(
                select(ParticipantRegistration)
                .where(
                    ParticipantRegistration.id == registration_id,
                    ParticipantRegistration.event_id == event.id,
                    ParticipantRegistration.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if reg is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")
            if expected_version is not None and reg.version != expected_version:
                raise_version_conflict(reg.version)

            old_status = reg.registration_status
            old_position = reg.waitlist_position
            if old_status == target_status:
                result = reg
            else:
                if target_status == "waitlisted":
                    max_position = await db.scalar(
                        select(func.max(ParticipantRegistration.waitlist_position)).where(
                            ParticipantRegistration.event_id == event.id,
                            ParticipantRegistration.registration_status == "waitlisted",
                        )
                    )
                    reg.waitlist_position = (max_position or 0) + 1
                elif target_status == "rejected":
                    reg.waitlist_position = None
                    reg.rejection_reason = rejection_reason
                reg.registration_status = target_status
                reg.reviewed_by = reviewer_id
                reg.reviewed_at = datetime.now(timezone.utc)
                reg.review_notes = review_notes
                reg.version = int(reg.version or 1) + 1
                if old_status == "waitlisted" and old_position is not None:
                    await db.execute(
                        update(ParticipantRegistration)
                        .where(
                            ParticipantRegistration.event_id == event.id,
                            ParticipantRegistration.registration_status == "waitlisted",
                            ParticipantRegistration.waitlist_position > old_position,
                        )
                        .values(
                            waitlist_position=ParticipantRegistration.waitlist_position - 1,
                            version=ParticipantRegistration.version + 1,
                        )
                    )
                await db.flush()
                result = reg

            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body=ParticipantRegistrationResponse.model_validate(result).model_dump(mode="json"),
                    resource_id=result.id,
                )
            await db.commit()
            await db.refresh(result)
            enqueue_event_registration_projection_refresh(
                organization_id=event.organization_id,
                event_id=event.id,
            )
            await cache_service.invalidate_event(event.organization_id, event.id)
            return result
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def approve(
        db: AsyncSession,
        *,
        event: Event,
        registration_id: uuid.UUID,
        reviewer_id: uuid.UUID,
        review_notes: str | None = None,
        idempotency_key: str | None = None,
        expected_version: int | None = None,
    ) -> ParticipantRegistration:
        """Approve a registration and create its participant/badge atomically."""
        return await RegistrationCommandService._approve_or_promote(
            db,
            event=event,
            registration_id=registration_id,
            reviewer_id=reviewer_id,
            review_notes=review_notes,
            idempotency_key=idempotency_key,
            expected_version=expected_version,
            promote=False,
        )

    @staticmethod
    async def promote(
        db: AsyncSession,
        *,
        event: Event,
        registration_id: uuid.UUID,
        reviewer_id: uuid.UUID,
        idempotency_key: str | None = None,
        expected_version: int | None = None,
    ) -> ParticipantRegistration:
        """Promote a waitlisted registration with one idempotent transaction."""
        return await RegistrationCommandService._approve_or_promote(
            db,
            event=event,
            registration_id=registration_id,
            reviewer_id=reviewer_id,
            review_notes="Promoted from waitlist",
            idempotency_key=idempotency_key,
            expected_version=expected_version,
            promote=True,
        )

    @staticmethod
    async def _approve_or_promote(
        db: AsyncSession,
        *,
        event: Event,
        registration_id: uuid.UUID,
        reviewer_id: uuid.UUID,
        review_notes: str | None,
        idempotency_key: str | None,
        expected_version: int | None,
        promote: bool,
    ) -> ParticipantRegistration:
        payload = {
            "event_id": str(event.id),
            "registration_id": str(registration_id),
            "review_notes": review_notes,
            "expected_version": expected_version,
            "promote": promote,
        }
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=reviewer_id,
                    operation="registration.promote" if promote else "registration.approve",
                    key=idempotency_key,
                    payload=payload,
                    ttl_seconds=30 * 24 * 60 * 60,
                )
                replay = replay_response(idem)
                if replay is not None:
                    existing = await db.scalar(
                        select(ParticipantRegistration).where(
                            ParticipantRegistration.id == idem.resource_id,
                            ParticipantRegistration.event_id == event.id,
                        )
                    )
                    if existing is None:
                        raise RuntimeError("Completed registration idempotency resource is missing.")
                    await db.commit()
                    return existing

            reg = await db.scalar(
                select(ParticipantRegistration)
                .where(
                    ParticipantRegistration.id == registration_id,
                    ParticipantRegistration.event_id == event.id,
                    ParticipantRegistration.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if reg is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")
            if expected_version is not None and reg.version != expected_version:
                raise_version_conflict(reg.version)
            if promote and reg.registration_status != "waitlisted":
                raise HTTPException(status_code=400, detail="Only waitlisted registrations can be promoted.")
            if not promote and reg.registration_status == "approved":
                result = reg
            else:
                rule = await db.scalar(
                    select(CapacityRule).where(
                        CapacityRule.event_id == event.id,
                        CapacityRule.session_id.is_(None),
                        CapacityRule.room_id.is_(None),
                    )
                )
                if rule:
                    current_approved = await db.scalar(
                        select(func.count(Participant.id)).where(
                            Participant.event_id == event.id,
                            Participant.deleted_at.is_(None),
                        )
                    ) or 0
                    if current_approved >= rule.capacity:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot approve. Event is at capacity ({rule.capacity}).",
                        )

                # Kept as a compatibility bridge for venue/admin callers while the
                # approval domain helper is extracted from its legacy router.
                from app.modules.registration.routers.registrations import helper_approve_registration

                old_position = reg.waitlist_position
                result = await helper_approve_registration(db, reg, reviewer_id, review_notes)
                if old_position is not None:
                    await db.execute(
                        update(ParticipantRegistration)
                        .where(
                            ParticipantRegistration.event_id == event.id,
                            ParticipantRegistration.registration_status == "waitlisted",
                            ParticipantRegistration.waitlist_position > old_position,
                        )
                        .values(
                            waitlist_position=ParticipantRegistration.waitlist_position - 1,
                            version=ParticipantRegistration.version + 1,
                        )
                    )
                result.version = int(result.version or 1) + 1
                await db.flush()

            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body=ParticipantRegistrationResponse.model_validate(result).model_dump(mode="json"),
                    resource_id=result.id,
                )
            await db.commit()
            await db.refresh(result)
            enqueue_event_registration_projection_refresh(
                organization_id=event.organization_id,
                event_id=event.id,
            )
            await cache_service.invalidate_event(event.organization_id, event.id)
            return result
        except Exception:
            await db.rollback()
            raise


class PaymentCommandService:
    """Own payment configuration writes and their cache invalidation."""

    @staticmethod
    async def update_config(
        db: AsyncSession,
        *,
        event: Event,
        payload,
        actor=None,
        idempotency_key: str | None = None,
        expected_version: int | None = None,
    ) -> int:
        from app.core.dependencies.feature_gate import enforce_event_operation
        from app.modules.audit.models.audit_log import AuditLog
        from app.config import settings as runtime_settings
        if actor is None:
            raise HTTPException(401, detail={"code": "AUTHENTICATION_REQUIRED"})
        expected_version = require_if_match(expected_version)
        if not idempotency_key:
            raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        if not 16 <= len(idempotency_key.strip()) <= 160:
            raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
        try:
            await enforce_event_operation(db, event.organization_id, event.id,
                "registration.payments.manage", user_id=actor.id)
            idem = None
            if actor is not None and idempotency_key:
                request_payload = payload.model_dump(mode="json")
                for field_name in ("stripe_credentials", "razorpay_credentials"):
                    credentials = request_payload.get(field_name)
                    if credentials:
                        for secret_name in ("secret_key", "key_secret"):
                            raw_secret = credentials.get(secret_name)
                            if raw_secret:
                                credentials[secret_name] = hashlib.sha256(str(raw_secret).encode("utf-8")).hexdigest()
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor.id,
                    operation="registration.payment_config.update",
                    key=idempotency_key,
                    # The request hash is persisted, never the credential values.
                    payload={"event_id": str(event.id), "expected_version": expected_version, "payload": request_payload},
                    ttl_seconds=30 * 24 * 60 * 60,
                )
                replay = replay_response(idem)
                if replay is not None:
                    if "version" not in replay[1]:
                        raise HTTPException(409, detail={"code": "LEGACY_PAYMENT_RECEIPT_RELOAD_REQUIRED"})
                    await db.commit()
                    return int(replay[1]["version"])
            locked_event = await db.scalar(select(Event).where(Event.id == event.id,
                Event.organization_id == event.organization_id, Event.deleted_at.is_(None))
                .options(selectinload(Event.portal_theme_setting)).with_for_update(of=Event)
                .execution_options(populate_existing=True))
            if locked_event is None:
                raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
            event = locked_event
            await enforce_event_operation(db, event.organization_id, event.id,
                "registration.payments.manage", user_id=actor.id)
            if expected_version is not None and int(event.version or 1) != expected_version:
                raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": event.version})
            settings = dict(event.registration_settings or {})

            if payload.payment_enabled is not None:
                settings["payment_enabled"] = payload.payment_enabled
                if event.portal_theme_setting:
                    event.portal_theme_setting.payment_enabled = payload.payment_enabled

            if payload.active_gateway is not None:
                valid_gateways = ("stripe", "razorpay", "simulated", "phonepe", "offline")
                if payload.active_gateway not in valid_gateways:
                    raise ValueError(f"Invalid gateway. Must be one of {valid_gateways}")
                settings["active_gateway"] = payload.active_gateway
                if event.portal_theme_setting:
                    event.portal_theme_setting.active_gateway = payload.active_gateway

            if payload.stripe_credentials is not None:
                existing = dict(settings.get("stripe_credentials") or {})
                raw_secret = payload.stripe_credentials.secret_key
                if raw_secret and not raw_secret.startswith("••••••••"):
                    existing["secret_key"] = encrypt_credential(raw_secret)
                if payload.stripe_credentials.publishable_key:
                    existing["publishable_key"] = payload.stripe_credentials.publishable_key
                settings["stripe_credentials"] = existing
                if event.portal_theme_setting:
                    event.portal_theme_setting.stripe_credentials = existing

            if payload.razorpay_credentials is not None:
                existing = dict(settings.get("razorpay_credentials") or {})
                raw_secret = payload.razorpay_credentials.key_secret
                if raw_secret and not raw_secret.startswith("••••••••"):
                    existing["key_secret"] = cipher.encrypt(raw_secret)
                if payload.razorpay_credentials.key_id:
                    existing["key_id"] = payload.razorpay_credentials.key_id
                settings["razorpay_credentials"] = existing

            if payload.auto_approve_paid is not None:
                settings["auto_approve_paid"] = payload.auto_approve_paid

            if hasattr(payload, "offline_instructions") and payload.offline_instructions is not None:
                settings["offline_instructions"] = payload.offline_instructions
                if event.portal_theme_setting:
                    extra = dict(event.portal_theme_setting.extra_settings or {})
                    extra["offline_instructions"] = payload.offline_instructions
                    event.portal_theme_setting.extra_settings = extra

            event.registration_settings = settings
            if runtime_settings.is_production and settings.get("payment_enabled") and settings.get("active_gateway", "simulated") == "simulated":
                raise HTTPException(422, detail={"code": "SIMULATED_PAYMENT_DISABLED"})
            event.version = int(event.version or 1) + 1
            if actor is not None:
                event.updated_by = actor.id
            selector = db.info.get("customer_request_selector")
            db.add(AuditLog(organization_id=event.organization_id, actor_user_id=actor.id,
                correlation_id=idem.id, resource_type="event_payment_config", resource_id=event.id,
                action_type="PAYMENT_CONFIGURATION_UPDATED", is_sensitive=True,
                old_state={"version": expected_version}, new_state={"version": event.version,
                    "changed_fields": sorted(payload.model_fields_set),
                    "workspace_id": str(event.operational_workspace_id),
                    "target_organization_id": str(event.organization_id),
                    "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or event.organization_id),
                    "access_mode": getattr(selector, "access_mode", "DIRECT")}))
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body={"message": "Payment configuration updated successfully.", "version": int(event.version)},
                )
            organization_id, event_id, saved_version = event.organization_id, event.id, int(event.version)
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        await cache_service.invalidate_event(organization_id, event_id)
        return saved_version


class PromoCodeCommandService:
    """Own event-scoped promo-code mutations and retry behavior."""

    @staticmethod
    async def create(db: AsyncSession, *, event: Event, payload, actor, idempotency_key: str | None = None) -> PromoCode:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=actor.id, operation="registration.promo.create", key=idempotency_key, payload={"event_id": str(event.id), "payload": payload.model_dump(mode="json")})
                replay = replay_response(idem)
                if replay is not None:
                    promo = await db.scalar(select(PromoCode).where(PromoCode.id == idem.resource_id, PromoCode.event_id == event.id))
                    if promo is None:
                        raise RuntimeError("Completed promo idempotency resource is missing.")
                    await db.commit()
                    return promo
            code = payload.code.strip().upper()
            if payload.discount_type not in ("percentage", "fixed"):
                raise HTTPException(status_code=400, detail="Discount type must be 'percentage' or 'fixed'.")
            existing = await db.scalar(select(PromoCode.id).where(PromoCode.event_id == event.id, PromoCode.code == code))
            if existing is not None:
                raise HTTPException(status_code=400, detail=f"Promo code '{payload.code}' already exists for this event.")
            promo = PromoCode(event_id=event.id, code=code, discount_type=payload.discount_type, discount_value=payload.discount_value, max_uses=payload.max_uses, expiry_date=payload.expiry_date, is_active=payload.is_active)
            db.add(promo)
            await db.flush()
            if idem is not None:
                await complete_idempotent(db, idem, response_status=201, response_body={"id": str(promo.id)}, resource_id=promo.id)
            await db.commit()
            await db.refresh(promo)
            await cache_service.invalidate_event(event.organization_id, event.id)
            return promo
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def update(db: AsyncSession, *, event: Event, promo_id: uuid.UUID, payload, actor, idempotency_key: str | None = None, if_match: str | None = None) -> PromoCode:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=actor.id, operation="registration.promo.update", key=idempotency_key, payload={"event_id": str(event.id), "promo_id": str(promo_id), "if_match": if_match, "payload": payload.model_dump(mode="json")})
                replay = replay_response(idem)
                if replay is not None:
                    promo = await db.scalar(select(PromoCode).where(PromoCode.id == idem.resource_id, PromoCode.event_id == event.id))
                    if promo is None:
                        raise RuntimeError("Completed promo idempotency resource is missing.")
                    await db.commit()
                    return promo
            promo = await db.scalar(select(PromoCode).where(PromoCode.id == promo_id, PromoCode.event_id == event.id).with_for_update())
            if promo is None:
                raise HTTPException(status_code=404, detail="Promo code not found.")
            expected_version = require_if_match(if_match) if if_match is not None else None
            if expected_version is not None and int(promo.version or 1) != expected_version:
                raise_version_conflict(int(promo.version or 1))
            for field in ("is_active", "max_uses", "expiry_date"):
                value = getattr(payload, field)
                if value is not None:
                    setattr(promo, field, value)
            promo.version = int(promo.version or 1) + 1
            await db.flush()
            if idem is not None:
                await complete_idempotent(db, idem, response_status=200, response_body={"id": str(promo.id)}, resource_id=promo.id)
            await db.commit()
            await db.refresh(promo)
            await cache_service.invalidate_event(event.organization_id, event.id)
            return promo
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def delete(db: AsyncSession, *, event: Event, promo_id: uuid.UUID, actor, idempotency_key: str | None = None, if_match: str | None = None) -> None:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=actor.id, operation="registration.promo.delete", key=idempotency_key, payload={"event_id": str(event.id), "promo_id": str(promo_id), "if_match": if_match})
                if replay_response(idem) is not None:
                    await db.commit()
                    return
            promo = await db.scalar(select(PromoCode).where(PromoCode.id == promo_id, PromoCode.event_id == event.id).with_for_update())
            if promo is None:
                raise HTTPException(status_code=404, detail="Promo code not found.")
            expected_version = require_if_match(if_match) if if_match is not None else None
            if expected_version is not None and int(promo.version or 1) != expected_version:
                raise_version_conflict(int(promo.version or 1))
            await db.delete(promo)
            await db.flush()
            if idem is not None:
                await complete_idempotent(db, idem, response_status=200, response_body={})
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
        except Exception:
            await db.rollback()
            raise


class FormCategoryCommandService:
    """Compatibility facade; the category command has one implementation."""
    @staticmethod
    async def create(db, *, payload, actor, idempotency_key=None, audience="CUSTOMER"):
        from .category_commands import CategoryCommands
        return await CategoryCommands.execute(db, operation="create", payload=payload,
            actor=actor, idempotency_key=idempotency_key, audience=audience)

    @staticmethod
    async def update(db, *, category_id, payload, actor, if_match=None,
                     idempotency_key=None, audience="CUSTOMER"):
        from .category_commands import CategoryCommands
        return await CategoryCommands.execute(db, operation="update", category_id=category_id,
            payload=payload, actor=actor, if_match=if_match, idempotency_key=idempotency_key, audience=audience)

    @staticmethod
    async def delete(db, *, category_id, actor, if_match=None,
                     idempotency_key=None, audience="CUSTOMER"):
        from .category_commands import CategoryCommands
        return await CategoryCommands.execute(db, operation="delete", category_id=category_id,
            actor=actor, if_match=if_match, idempotency_key=idempotency_key, audience=audience)


class FormTemplateCommandService:
    """Own tenant-scoped form-template mutations."""

    @staticmethod
    def _response(template: FormTemplate) -> FormTemplateResponse:
        # Check __dict__ to avoid triggering async lazy-load IO on unloaded relationship
        category = template.__dict__.get("category")
        cat_name = getattr(category, "name", None) if category else None
        if not cat_name and template.category_key:
            cat_name = template.category_key.replace("_", " ").title()

        # Recover event_id from settings JSONB if stored there (EVENT-scoped templates)
        settings = template.settings or {}
        if template.scope_type == "EVENT":
            from app.modules.registration.schemas.event_form_contracts import form_document
            try:
                if not isinstance(settings, dict):
                    raise ValueError("Invalid event form settings.")
                event_id_val = uuid.UUID(str(settings.get("_event_id") or settings.get("event_id")))
                document = form_document(template.fields or [], settings, stored=True, event_id=event_id_val)
                fields, settings = document["fields"], document["settings"]
            except ValueError:
                raise HTTPException(409, detail={"code": "FORM_DOCUMENT_RECONCILIATION_REQUIRED"})
        else:
            fields = template.fields or []
        if template.scope_type != "EVENT":
            event_id_val = None
        return FormTemplateResponse(
            id=template.id,
            category_id=template.category_id,
            organization_id=template.organization_id,
            event_id=event_id_val,
            created_by=template.created_by,
            name=template.name,
            slug=template.slug,
            description=template.description,
            category_key=template.category_key,
            category_name=cat_name or "Registration Form",
            scope_type=template.scope_type,
            is_default=template.is_default,
            is_system=template.is_system,
            version=template.version,
            is_active=template.is_active,
            fields=fields,
            settings=settings,
            preview_image_url=None if template.scope_type == "EVENT" else template.preview_image_url,
            created_at=template.created_at,
            updated_at=template.updated_at,
        )

    @staticmethod
    async def create(db, *, payload, actor, idempotency_key=None, audience="CUSTOMER"):
        from .template_commands import TemplateCommands
        return await TemplateCommands.execute(db, operation="create", payload=payload,
            actor=actor, idempotency_key=idempotency_key, audience=audience)

    @staticmethod
    async def update(db, *, template_id, payload, actor, if_match=None, idempotency_key=None, audience="CUSTOMER"):
        from .template_commands import TemplateCommands
        return await TemplateCommands.execute(db, operation="update", template_id=template_id, payload=payload,
            actor=actor, if_match=if_match, idempotency_key=idempotency_key, audience=audience)

    @staticmethod
    async def duplicate(db, *, template_id, actor, if_match=None, idempotency_key=None, audience="CUSTOMER"):
        from .template_commands import TemplateCommands
        return await TemplateCommands.execute(db, operation="duplicate", template_id=template_id,
            actor=actor, if_match=if_match, idempotency_key=idempotency_key, audience=audience)

    @staticmethod
    async def save_event_copy(
        db: AsyncSession, *, source_template_id: uuid.UUID,
        payload: FormTemplateSaveEventCopy, actor,
        if_match: str | None = None, idempotency_key: str | None = None,
        _transaction_receipt=None, _organization_id=None,
        _authorization_proof=None,
    ) -> FormTemplateResponse:
        """Versioned copy command; never silently overwrite an existing copy."""
        from app.core.dependencies.feature_gate import enforce_event_operation
        from app.modules.audit.models.audit_log import AuditLog
        # Delegated EMC sessions act inside the selected client tenant; the
        # user's home organisation is not the ownership authority.
        selector = db.info.get("customer_request_selector")
        organization_id = (_organization_id
            or getattr(selector, "active_organization_id", None)
            or getattr(actor, "request_organization_id", None)
            or getattr(actor, "organization_id", None))
        if organization_id is None:
            raise HTTPException(403, detail="Organization context is required.")
        expected = require_if_match(if_match)
        if not idempotency_key:
            raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        if not 16 <= len(idempotency_key.strip()) <= 160:
            raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
        if _authorization_proof is not None and _authorization_proof is not _EVENT_COPY_AUTHORIZATION:
            raise RuntimeError("Invalid parent event-copy authorization proof")
        try:
            if _authorization_proof is not _EVENT_COPY_AUTHORIZATION:
                await enforce_event_operation(db, organization_id, payload.event_id,
                    "registration.forms.manage", user_id=actor.id)
            # Internal aggregate callers own the receipt and the final commit.
            receipt = _transaction_receipt
            if receipt is None:
                receipt = await begin_idempotent(db, organization_id=organization_id,
                    actor_id=actor.id, operation="registration.form_template.event_copy",
                    key=idempotency_key, payload={"source": str(source_template_id),
                        "version": expected, "changes": payload.model_dump(mode="json")})
            replay = replay_response(receipt) if _transaction_receipt is None else None
            if replay is not None:
                response = FormTemplateResponse.model_validate(replay[1])
                from app.modules.registration.schemas.event_form_contracts import form_document
                document = form_document(response.fields, response.settings,
                    stored=True, event_id=payload.event_id)
                response.fields, response.settings = document["fields"], document["settings"]
                response.preview_image_url = None
                await db.commit()
                return response
            from .catalogue_lifecycle_locks import lock_catalogue_reference_writes
            await lock_catalogue_reference_writes(db)
            event = await db.scalar(select(Event).where(Event.id == payload.event_id,
                Event.organization_id == organization_id, Event.deleted_at.is_(None))
                .options(raiseload(Event.portal_theme_setting))
                .with_for_update(of=Event).execution_options(populate_existing=True))
            if event is None:
                raise HTTPException(404, detail="Event not found.")
            # The initial admission acquired transaction-scoped access-revision
            # locks. Repeating the complete permission/capability graph here is
            # redundant and cannot strengthen revocation ordering before commit.
            source = await db.scalar(select(FormTemplate).where(
                FormTemplate.id == source_template_id, FormTemplate.deleted_at.is_(None),
                or_(and_(FormTemplate.scope_type == "GLOBAL", FormTemplate.organization_id.is_(None)),
                    and_(FormTemplate.scope_type.in_(("ORGANIZATION", "EVENT")),
                        FormTemplate.organization_id == organization_id)))
                .options(selectinload(FormTemplate.category)).with_for_update(of=FormTemplate)
                .execution_options(populate_existing=True, shared_form_catalogue=True))
            if source is None:
                raise HTTPException(404, detail="Source template not found.")
            if not source.is_active:
                raise HTTPException(409, detail={"code": "SOURCE_TEMPLATE_INACTIVE"})
            if source.category_id is not None:
                category = await db.scalar(select(FormCategory).where(
                    FormCategory.id == source.category_id,
                    FormCategory.deleted_at.is_(None), FormCategory.is_active.is_(True),
                    or_(FormCategory.organization_id == source.organization_id,
                        FormCategory.organization_id.is_(None)))
                    .with_for_update(read=True, of=FormCategory)
                    .execution_options(shared_form_catalogue=True))
                if category is None:
                    raise HTTPException(404, detail="Template category not found.")
            if source.scope_type == "EVENT":
                markers = [(source.settings or {}).get(key) for key in ("_event_id", "event_id")
                    if (source.settings or {}).get(key) is not None]
                if not markers or any(str(marker) != str(event.id) for marker in markers):
                    raise HTTPException(404, detail="Source template not found.")
            if int(source.version or 1) != expected:
                raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT",
                    "current_version": int(source.version or 1)})
            # Registration binding has its own aggregate version and atomic command.
            if source.category_key == "registration":
                raise HTTPException(409, detail={"code": "USE_REGISTRATION_FORM_CONFIG_COMMAND"})
            if source.category_key == "abstract" and _transaction_receipt is None:
                raise HTTPException(409, detail={"code": "USE_ABSTRACT_FORM_CONFIGURATION_COMMAND"})
            if source.scope_type == "EVENT":
                # Validate stored provenance before carrying it into another revision.
                FormTemplateCommandService._response(source)
            else:
                from .template_commands import catalogue_projection
                catalogue_projection(source)
            if source.scope_type == "EVENT":
                from .template_lineage import require_historical_lineage
                historical_root = await require_historical_lineage(db, source)
                root = str(historical_root) if historical_root is not None else None
            else:
                root = str(source.id)
            existing = source if source.scope_type == "EVENT" else await db.scalar(
                select(FormTemplate).where(FormTemplate.scope_type == "EVENT",
                    FormTemplate.organization_id == organization_id, FormTemplate.deleted_at.is_(None),
                    or_(
                        func.jsonb_extract_path_text(FormTemplate.settings, "_event_id") == str(event.id),
                        func.jsonb_extract_path_text(FormTemplate.settings, "event_id") == str(event.id),
                    ),
                    func.jsonb_extract_path_text(FormTemplate.settings, "_source_template_id") == root)
                .order_by(FormTemplate.id).limit(1))
            if existing is not None and source.scope_type != "EVENT":
                raise HTTPException(409, detail={"code": "EVENT_COPY_EXISTS_RELOAD_REQUIRED"})
            from app.modules.registration.schemas.event_form_contracts import form_document
            raw_settings = payload.settings.model_dump(mode="json") if hasattr(payload.settings, "model_dump") else dict(payload.settings or {})
            document = form_document([field.model_dump(mode="json") for field in payload.fields], raw_settings)
            raw_settings = document["settings"]
            from app.modules.registration.services.managed_form_assets import require_form_assets
            await require_form_assets(db, organization_id=organization_id,
                settings=raw_settings, lock=True)
            raw_settings["_event_id"] = str(event.id)
            if root is not None:
                raw_settings["_source_template_id"] = root
            fields = document["fields"]
            previous = int(existing.version or 1) if existing is not None else None
            if existing is None:
                existing = FormTemplate(id=uuid.uuid4(), category_id=source.category_id,
                    organization_id=organization_id, created_by=actor.id,
                    name=payload.name or source.name,
                    slug=f"{source.slug}-evt-{uuid.uuid4().hex[:8]}",
                    description=source.description, category_key=source.category_key,
                    scope_type="EVENT", is_default=False, is_system=False, is_active=True,
                    version=1, fields=fields, settings=raw_settings)
                db.add(existing)
            else:
                existing.name = payload.name or existing.name
                existing.fields, existing.settings = fields, raw_settings
                existing.version = previous + 1
                existing.updated_at = datetime.now(timezone.utc)
            await db.flush()
            response = FormTemplateCommandService._response(existing)
            selector = db.info.get("customer_request_selector")
            db.add(AuditLog(organization_id=organization_id, actor_user_id=actor.id,
                resource_type="form_template", resource_id=existing.id,
                action_type="EVENT_FORM_TEMPLATE_SAVED", correlation_id=receipt.id,
                old_state={"version": previous}, new_state={"version": response.version,
                    "event_id": str(event.id), "workspace_id": str(event.operational_workspace_id),
                    "source_template_id": str(source.id), "field_count": len(fields),
                    "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or organization_id),
                    "target_organization_id": str(organization_id),
                    "access_mode": getattr(selector, "access_mode", "DIRECT")}))
            if _transaction_receipt is None:
                await complete_idempotent(db, receipt, response_status=200,
                    response_body=response.model_dump(mode="json"), resource_id=existing.id)
                await db.commit()
        except Exception:
            await db.rollback()
            raise
        if _transaction_receipt is None:
            await cache_service.invalidate_domain("registration_form", organization_id, payload.event_id)
        return response

    @staticmethod
    async def delete(db, *, template_id, actor, if_match=None, idempotency_key=None, audience="CUSTOMER"):
        from .template_commands import TemplateCommands
        return await TemplateCommands.execute(db, operation="delete", template_id=template_id,
            actor=actor, if_match=if_match, idempotency_key=idempotency_key, audience=audience)



class RegistrationFormCommandService:
    """Own the transaction for organizer registration-form configuration."""

    @staticmethod
    async def set_live(db: AsyncSession, *, event: Event, actor_user_id: uuid.UUID,
                       is_live: bool, expected_version: int, idempotency_key: str) -> dict:
        from app.core.dependencies.feature_gate import enforce_event_operation
        from app.modules.audit.models.audit_log import AuditLog
        if actor_user_id is None:
            raise HTTPException(401, detail={"code": "AUTHENTICATION_REQUIRED"})
        if expected_version < 1 or type(is_live) is not bool:
            raise HTTPException(400, detail={"code": "INVALID_PORTAL_STATUS_INPUT"})
        if not idempotency_key:
            raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        if not 8 <= len(idempotency_key.strip()) <= 200:
            raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
        try:
            await enforce_event_operation(db, event.organization_id, event.id,
                "registration.forms.manage", user_id=actor_user_id)
            receipt = await begin_idempotent(db, organization_id=event.organization_id,
                actor_id=actor_user_id, operation="registration.portal-status.update",
                key=idempotency_key, payload={"event_id": str(event.id),
                    "is_live": is_live, "version": expected_version})
            replay = replay_response(receipt)
            if replay is not None:
                await db.commit()
                return replay[1]
            from .catalogue_lifecycle_locks import lock_catalogue_reference_writes
            await lock_catalogue_reference_writes(db)
            # Serialize first creation as well as existing-record updates.
            owned = await db.scalar(select(Event.id).where(Event.id == event.id,
                Event.organization_id == event.organization_id,
                Event.deleted_at.is_(None)).with_for_update(of=Event))
            if owned is None:
                raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
            await enforce_event_operation(db, event.organization_id, event.id,
                "registration.forms.manage", user_id=actor_user_id)
            config = await db.scalar(select(RegistrationFormConfig).where(
                RegistrationFormConfig.event_id == event.id).with_for_update()
                .execution_options(populate_existing=True))
            version = int(config.version or 1) if config else 1
            if version != expected_version:
                raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT",
                    "current_version": version})
            previous_live = config.is_live if config else True
            if config is not None:
                from .aggregate_reference_validation import aggregate_reference_issues
                issues = (await aggregate_reference_issues(db, rows=[config],
                    organization_id=event.organization_id, resource_type="REGISTRATION_FORM", lock=True))[config.id]
                if issues:
                    raise HTTPException(409, detail={"code": "FORM_TEMPLATE_RECONCILIATION_REQUIRED"
                        if "TEMPLATE_REFERENCE_UNAVAILABLE" in issues else "FORM_CATEGORY_RECONCILIATION_REQUIRED"})
                from app.modules.registration.schemas.event_form_contracts import form_document
                try:
                    document = form_document(config.fields or [], config.settings or {}, stored=True, event_id=event.id)
                except ValueError:
                    raise HTTPException(409, detail={"code": "FORM_DOCUMENT_RECONCILIATION_REQUIRED"})
                from app.modules.registration.services.managed_form_assets import require_form_assets
                await require_form_assets(db, organization_id=event.organization_id,
                    settings=document["settings"], lock=True)
            if config is None:
                config = RegistrationFormConfig(event_id=event.id, fields=[], settings={})
                db.add(config)
            config.is_live, config.version = is_live, version + 1
            await db.flush()
            result = {"id": str(config.id), "event_id": str(event.id),
                "is_live": config.is_live, "version": config.version}
            selector = db.info.get("customer_request_selector")
            db.add(AuditLog(organization_id=event.organization_id, actor_user_id=actor_user_id,
                resource_type="registration_form", resource_id=config.id,
                action_type="REGISTRATION_PORTAL_STATUS_UPDATED", is_sensitive=True, correlation_id=receipt.id,
                old_state={"is_live": previous_live, "version": version},
                new_state={**result, "workspace_id": str(event.operational_workspace_id),
                    "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or event.organization_id),
                    "access_mode": getattr(selector, "access_mode", "DIRECT")}))
            await complete_idempotent(db, receipt, response_status=200,
                response_body=result, resource_id=config.id)
            organization_id, event_id = event.organization_id, event.id
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        await cache_service.invalidate_domain("registration_form", organization_id, event_id)
        return result

    @staticmethod
    async def update(
        db: AsyncSession,
        *,
        event: Event,
        payload: RegistrationFormConfigUpdate,
        if_match: str | None = None,
        actor_user_id: uuid.UUID | None = None,
        idempotency_key: str | None = None,
    ) -> dict:
        from app.core.dependencies.feature_gate import enforce_event_operation
        from app.modules.audit.models.audit_log import AuditLog
        if actor_user_id is None:
            raise HTTPException(401, detail={"code": "AUTHENTICATION_REQUIRED"})
        expected_version = require_if_match(if_match)
        if not idempotency_key:
            raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        if not 16 <= len(idempotency_key.strip()) <= 160:
            raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
        try:
            await enforce_event_operation(db, event.organization_id, event.id,
                "registration.forms.manage", user_id=actor_user_id)
            idem = None
            if actor_user_id is not None and idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor_user_id,
                    operation="registration.form.update",
                    key=idempotency_key,
                    payload={
                        "event_id": str(event.id),
                        "payload": payload.model_dump(mode="json"),
                        "if_match": expected_version,
                    },
                )
                replay = replay_response(idem)
                if replay is not None:
                    if not {"event_id", "fields", "is_live", "version"}.issubset(replay[1]):
                        raise HTTPException(409, detail={"code": "LEGACY_FORM_RECEIPT_RELOAD_REQUIRED"})
                    projected = RegistrationFormConfigResponse.model_validate(replay[1]).model_dump(mode="json")
                    await db.commit()
                    return projected

            config = await RegistrationFormCommandService._update(
                db, event=event, payload=payload, if_match=if_match,
                actor_user_id=actor_user_id,
            )
            registration_settings = event.registration_settings or {}
            result = RegistrationFormConfigResponse.model_validate({
                "id": config.id, "event_id": event.id, "template_id": config.template_id,
                "category_id": config.category_id, "is_live": config.is_live,
                "fields": config.fields, "settings": config.settings or {}, "version": config.version,
                "terms_and_conditions": registration_settings.get("terms_and_conditions", ""),
                "faqs": registration_settings.get("faqs"),
                "include_default_faqs": registration_settings.get("include_default_faqs", True),
            }).model_dump(mode="json")
            selector = db.info.get("customer_request_selector")
            db.add(AuditLog(organization_id=event.organization_id, actor_user_id=actor_user_id,
                resource_type="registration_form", resource_id=config.id,
                action_type="REGISTRATION_FORM_UPDATED", is_sensitive=True,
                correlation_id=idem.id,
                old_state={"version": expected_version}, new_state={"version": config.version,
                    "event_id": str(event.id), "workspace_id": str(event.operational_workspace_id),
                    "changed_fields": sorted(payload.model_fields_set),
                    "target_organization_id": str(event.organization_id),
                    "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or event.organization_id),
                    "access_mode": getattr(selector, "access_mode", "DIRECT")}))
            # The application command owns the single transaction boundary.
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body=result,
                    resource_id=config.id,
                )
            organization_id, event_id = event.organization_id, event.id
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        await cache_service.invalidate_domain("registration_form", organization_id, event_id)
        await cache_service.invalidate_event(organization_id, event_id)
        return result

    @staticmethod
    async def _update(
        db: AsyncSession,
        *,
        event: Event,
        payload: RegistrationFormConfigUpdate,
        if_match: str | None = None,
        actor_user_id: uuid.UUID,
    ) -> RegistrationFormConfig:
        from .catalogue_lifecycle_locks import lock_catalogue_reference_writes
        await lock_catalogue_reference_writes(db)
        # Match portal publication ordering: event before its form record.
        # This also serializes concurrent first-time form creation.
        owned = await db.scalar(select(Event).where(Event.id == event.id,
            Event.organization_id == event.organization_id,
            Event.deleted_at.is_(None)).with_for_update(of=Event).execution_options(populate_existing=True))
        if owned is None:
            raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
        from app.core.dependencies.feature_gate import enforce_event_operation
        await enforce_event_operation(db, event.organization_id, event.id,
            "registration.forms.manage", user_id=actor_user_id)
        result = await db.execute(
            select(RegistrationFormConfig)
            .where(RegistrationFormConfig.event_id == event.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        config = result.scalar_one_or_none()

        expected_version = require_if_match(if_match)
        current_version = int(config.version or 1) if config else 1
        if current_version != expected_version:
            raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT",
                "current_version": current_version})
        if config is None:
            # Preserve the existing GET projection for an unconfigured form.
            config = RegistrationFormConfig(event_id=event.id, is_live=True)
            db.add(config)
            await db.flush()

        if payload.is_live is not None:
            config.is_live = payload.is_live

        template_scope = or_(
            and_(FormTemplate.organization_id.is_(None), FormTemplate.scope_type == "GLOBAL"),
            and_(FormTemplate.organization_id == event.organization_id,
                or_(FormTemplate.scope_type == "ORGANIZATION",
                    and_(FormTemplate.scope_type == "EVENT", or_(
                        FormTemplate.settings["event_id"].astext == str(event.id),
                        FormTemplate.settings["_event_id"].astext == str(event.id),
                    )))))
        if payload.template_id is not None:
            try:
                template_uuid = uuid.UUID(str(payload.template_id))
                template_selector = FormTemplate.id == template_uuid
            except ValueError:
                template_selector = FormTemplate.slug == str(payload.template_id)
            matches = list((await db.scalars(select(FormTemplate).where(template_selector,
                FormTemplate.category_key == "registration",
                template_scope, FormTemplate.is_active.is_(True),
                FormTemplate.deleted_at.is_(None)).order_by(FormTemplate.id).limit(2)
                .with_for_update(read=True).execution_options(
                    shared_form_catalogue=True, populate_existing=True))).all())
            if not matches:
                raise HTTPException(404, detail={"code": "FORM_TEMPLATE_NOT_FOUND"})
            if len(matches) != 1:
                raise HTTPException(409, detail={"code": "AMBIGUOUS_FORM_TEMPLATE"})
            config.template_id = matches[0].id

        if payload.category_id is not None:
            category = await db.scalar(select(FormCategory.id).where(
                FormCategory.id == payload.category_id, FormCategory.deleted_at.is_(None),
                FormCategory.is_active.is_(True), or_(FormCategory.organization_id == event.organization_id,
                    and_(FormCategory.organization_id.is_(None), FormCategory.is_system.is_(True))))
                .with_for_update(read=True).execution_options(shared_form_catalogue=True))
            if category is None:
                raise HTTPException(404, detail={"code": "FORM_CATEGORY_NOT_FOUND"})
            config.category_id = payload.category_id

        # Every aggregate write revalidates retained references after acquiring
        # the shared lifecycle lock. A status/settings-only save must not carry
        # a retired template or category into a new registration-form version.
        from .aggregate_reference_validation import aggregate_reference_issues
        issues = (await aggregate_reference_issues(db, rows=[config],
            organization_id=event.organization_id, resource_type="REGISTRATION_FORM", lock=True))[config.id]
        if issues:
            raise HTTPException(409, detail={"code": "FORM_TEMPLATE_RECONCILIATION_REQUIRED"
                if "TEMPLATE_REFERENCE_UNAVAILABLE" in issues else "FORM_CATEGORY_RECONCILIATION_REQUIRED"})

        from app.modules.registration.schemas.event_form_contracts import form_document
        # Validate the effective pair, including partial saves, before any field writes.
        effective_settings = dict(payload.settings if payload.settings is not None else config.settings or {})
        for key in ("event_id", "_event_id", "_source_template_id"):
            if key in (config.settings or {}):
                effective_settings[key] = config.settings[key]
        try:
            document = form_document(payload.fields if payload.fields is not None else config.fields or [],
                effective_settings, stored=True, event_id=event.id)
        except ValueError:
            raise HTTPException(409, detail={"code": "FORM_DOCUMENT_RECONCILIATION_REQUIRED"})
        from app.modules.registration.services.managed_form_assets import require_form_assets
        await require_form_assets(db, organization_id=event.organization_id,
            settings=document["settings"], lock=True)
        config.settings = document["settings"]

        if payload.fields is not None or payload.settings is not None:
            fields = document["fields"]
            config.fields = fields
            await db.execute(delete(FormField).where(FormField.form_id == config.id))

            sort_index = 0
            has_state = any((field.get("name") or field.get("id")) == "state" for field in fields)
            for field in fields:
                field_name = field.get("name") or field.get("id") or f"field_{sort_index}"
                field_type = field.get("type", "text")
                db.add(
                    FormField(
                        id=uuid.uuid4(),
                        form_id=config.id,
                        field_name=field_name,
                        field_type=field_type,
                        is_required=field.get("is_required", False),
                        sort_order=sort_index,
                        label=field.get("label", ""),
                        is_active=field.get("is_active", True),
                        is_default=field.get("is_default", False),
                        placeholder=field.get("placeholder", ""),
                        options=field.get("options", []),
                    )
                )
                sort_index += 1
                if field_name == "state":
                    has_state = True
                elif field_type == "country" or field_name == "country":
                    if not has_state:
                        db.add(
                            FormField(
                                id=uuid.uuid4(),
                                form_id=config.id,
                                field_name="state",
                                field_type="state",
                                is_required=field.get("is_required", False),
                                sort_order=sort_index,
                                label="State / Province",
                                is_active=field.get("is_active", True),
                                is_default=True,
                                placeholder="Select state / province",
                                options=[],
                            )
                        )
                        sort_index += 1
                        has_state = True

            # Auto-create or update event-scoped FormTemplate in design.form_templates
            event_template = None
            if config.template_id:
                event_template = await db.scalar(
                    select(FormTemplate).where(
                        FormTemplate.id == config.template_id,
                        FormTemplate.category_key == "registration",
                        template_scope,
                        FormTemplate.is_active.is_(True),
                        FormTemplate.deleted_at.is_(None),
                    ).with_for_update(read=True).execution_options(
                        shared_form_catalogue=True, populate_existing=True)
                )
                if event_template is None:
                    raise HTTPException(404, detail={"code": "FORM_TEMPLATE_NOT_FOUND"})

            merged_settings = dict(config.settings or {})
            merged_settings["event_id"] = str(event.id)
            merged_settings["_event_id"] = str(event.id)
            # Provenance comes from an authorised source, never a caller-supplied ID.
            merged_settings.pop("_source_template_id", None)
            if event_template is not None:
                if event_template.scope_type != "EVENT":
                    merged_settings["_source_template_id"] = str(event_template.id)
                else:
                    from .template_lineage import require_historical_lineage
                    original_id = await require_historical_lineage(db, event_template)
                    if original_id is not None:
                        merged_settings["_source_template_id"] = str(original_id)
            config.settings = merged_settings

            if event_template is None or event_template.is_system or event_template.scope_type != "EVENT":
                custom_name = f"{event.name} — Registration Form"
                custom_slug = f"event-reg-{event.id.hex}"
                reg_categories = list((await db.scalars(
                    select(FormCategory).where(FormCategory.slug == "registration",
                        FormCategory.organization_id.is_(None), FormCategory.is_system.is_(True),
                        FormCategory.is_active.is_(True), FormCategory.deleted_at.is_(None))
                        .order_by(FormCategory.id).limit(2)
                        .execution_options(shared_form_catalogue=True)
                )).all())
                if len(reg_categories) > 1:
                    raise HTTPException(409, detail={"code": "CATEGORY_RECONCILIATION_REQUIRED"})
                reg_cat = reg_categories[0] if reg_categories else None
                cat_id = config.category_id or (reg_cat.id if reg_cat else None)

                existing_event_templates = list((await db.scalars(
                    select(FormTemplate).where(
                        FormTemplate.slug == custom_slug,
                        FormTemplate.organization_id == event.organization_id,
                        FormTemplate.scope_type == "EVENT",
                        or_(FormTemplate.settings["event_id"].astext == str(event.id),
                            FormTemplate.settings["_event_id"].astext == str(event.id)),
                        FormTemplate.deleted_at.is_(None),
                    ).order_by(FormTemplate.id).limit(2).with_for_update()
                    .execution_options(populate_existing=True)
                )).all())
                if len(existing_event_templates) > 1:
                    raise HTTPException(409, detail={"code": "EVENT_TEMPLATE_RECONCILIATION_REQUIRED"})
                existing_event_tpl = existing_event_templates[0] if existing_event_templates else None
                if existing_event_tpl:
                    existing_event_tpl.fields = fields
                    existing_event_tpl.settings = merged_settings
                    existing_event_tpl.version = int(existing_event_tpl.version or 1) + 1
                    config.template_id = existing_event_tpl.id
                else:
                    new_event_tpl = FormTemplate(
                        id=uuid.uuid4(),
                        name=custom_name,
                        slug=custom_slug,
                        description=f"Custom registration questionnaire for {event.name}.",
                        category_key="registration",
                        category_id=cat_id,
                        organization_id=event.organization_id,
                        scope_type="EVENT",
                        is_default=False,
                        is_system=False,
                        is_active=True,
                        version=1,
                        fields=fields,
                        settings=merged_settings,
                    )
                    db.add(new_event_tpl)
                    await db.flush()
                    config.template_id = new_event_tpl.id
            elif event_template and not event_template.is_system:
                event_template.fields = fields
                event_template.settings = merged_settings
                event_template.version = int(event_template.version or 1) + 1
                event_template.updated_at = datetime.now(timezone.utc)

        registration_settings = dict(event.registration_settings or {})
        if payload.terms_and_conditions is not None:
            registration_settings["terms_and_conditions"] = payload.terms_and_conditions
        if payload.faqs is not None:
            registration_settings["faqs"] = [
                faq.model_dump() if hasattr(faq, "model_dump") else dict(faq)
                for faq in payload.faqs
            ]
        if payload.include_default_faqs is not None:
            registration_settings["include_default_faqs"] = payload.include_default_faqs
        if {"terms_and_conditions", "faqs", "include_default_faqs"} & payload.model_fields_set:
            event.registration_settings = registration_settings
            event.version = int(event.version or 1) + 1

        config.version = int(config.version or 1) + 1
        await db.flush()
        return config


class ParticipantCommandService:
    """Own participant mutation transactions while reusing domain rules."""

    @staticmethod
    async def _validate_upload_answers(db, *, event: Event, values: dict | None) -> None:
        if values is None:
            return
        config = await db.scalar(select(RegistrationFormConfig).where(
            RegistrationFormConfig.event_id == event.id))
        if config is None:
            return
        from app.modules.registration.schemas.event_form_contracts import form_document
        try:
            document = form_document(config.fields or [], config.settings or {},
                stored=True, event_id=event.id)
        except ValueError as exc:
            raise HTTPException(409, detail={"code": "FORM_DOCUMENT_RECONCILIATION_REQUIRED"}) from exc
        from app.modules.registration.services.managed_registration_uploads import (
            validate_managed_registration_upload_answers,
        )
        await validate_managed_registration_upload_answers(db,
            organization_id=event.organization_id, event_id=event.id,
            fields=document["fields"], values=values)

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        event: Event,
        payload: ParticipantCreate,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
        expected_version: int | None = None,
    ) -> tuple[Participant, bool, str]:
        try:
            idem = await begin_idempotent(
                db,
                organization_id=event.organization_id,
                actor_id=actor_user_id,
                operation="registration.participant.create",
                key=idempotency_key,
                payload={
                    "event_id": str(event.id),
                    "payload": payload.model_dump(mode="json"),
                    "source": source,
                },
            )
            replay = replay_response(idem)
            if replay is not None:
                resource_id = idem.resource_id
                if resource_id is None:
                    raise RuntimeError("Completed participant idempotency record has no resource.")
                refreshed = await db.scalar(
                    select(Participant)
                    .options(selectinload(Participant.role_rel))
                    .where(
                        Participant.id == resource_id,
                        Participant.event_id == event.id,
                    )
                )
                if refreshed is None:
                    raise RuntimeError("Completed participant idempotency resource is missing.")
                return refreshed, bool((replay[1] or {}).get("is_free", False)), "REPLAYED"

            await ParticipantCommandService._validate_upload_answers(db,
                event=event, values=payload.custom_fields or {})
            participant, is_free, outcome = await EventParticipantMutationService.create(
                db,
                event=event,
                payload=payload,
                actor_user_id=actor_user_id,
                idempotency_key=idempotency_key,
                source=source,
            )
            response = ParticipantResponse.model_validate(participant)
            response.is_free = is_free
            await complete_idempotent(
                db,
                idem,
                response_status=201,
                response_body=response.model_dump(mode="json"),
                resource_id=participant.id,
            )
            await db.commit()
            refreshed = await db.scalar(
                select(Participant)
                .options(selectinload(Participant.role_rel))
                .where(Participant.id == participant.id)
            )
            if refreshed is None:
                raise RuntimeError("Participant disappeared after commit.")
            enqueue_event_registration_projection_refresh(
                organization_id=event.organization_id,
                event_id=event.id,
            )
            await cache_service.invalidate_event(event.organization_id, event.id)
            return refreshed, is_free, outcome
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def update(
        db: AsyncSession,
        *,
        event: Event,
        participant_id: uuid.UUID,
        payload: ParticipantUpdate,
        actor_user_id: uuid.UUID,
        expected_version: int | None = None,
        idempotency_key: str | None = None,
    ) -> tuple[Participant, bool, dict, dict]:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor_user_id,
                    operation="registration.participant.update",
                    key=idempotency_key,
                    payload={
                        "event_id": str(event.id),
                        "participant_id": str(participant_id),
                        "payload": payload.model_dump(mode="json"),
                        "expected_version": expected_version,
                    },
                )
                replay = replay_response(idem)
                if replay is not None:
                    if idem.resource_id is None:
                        raise RuntimeError("Completed participant idempotency record has no resource.")
                    refreshed = await db.scalar(
                        select(Participant)
                        .options(selectinload(Participant.role_rel))
                        .where(
                            Participant.id == idem.resource_id,
                            Participant.event_id == event.id,
                            Participant.deleted_at.is_(None),
                        )
                    )
                    if refreshed is None:
                        raise RuntimeError("Completed participant idempotency resource is missing.")
                    await db.commit()
                    return refreshed, bool((replay[1] or {}).get("is_free", False)), {}, {}

            if "custom_fields" in payload.model_fields_set:
                await ParticipantCommandService._validate_upload_answers(db,
                    event=event, values=payload.custom_fields or {})
            participant, is_free, changes, old = await EventParticipantMutationService.update(
                db,
                event=event,
                participant_id=participant_id,
                payload=payload,
                actor_user_id=actor_user_id,
                expected_version=expected_version,
            )
            if idem is not None:
                response = ParticipantResponse.model_validate(participant)
                response.is_free = is_free
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body=response.model_dump(mode="json"),
                    resource_id=participant.id,
                )
            await db.commit()
            refreshed = await db.scalar(
                select(Participant)
                .options(selectinload(Participant.role_rel))
                .where(Participant.id == participant.id)
            )
            if refreshed is None:
                raise RuntimeError("Participant disappeared after commit.")
            enqueue_event_registration_projection_refresh(
                organization_id=event.organization_id,
                event_id=event.id,
            )
            await cache_service.invalidate_event(event.organization_id, event.id)
            return refreshed, is_free, changes, old
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def archive(
        db: AsyncSession,
        *,
        event: Event,
        participant_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        source: str,
        expected_version: int | None = None,
        idempotency_key: str | None = None,
    ) -> Participant:
        """Archive a participant with command-owned commit and cache invalidation."""
        try:
            idem = None
            payload = {
                "event_id": str(event.id),
                "participant_id": str(participant_id),
                "expected_version": expected_version,
                "source": source,
            }
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor_user_id,
                    operation="registration.participant.archive",
                    key=idempotency_key,
                    payload=payload,
                )
                replay = replay_response(idem)
                if replay is not None:
                    existing = await db.scalar(
                        select(Participant).options(selectinload(Participant.role_rel)).where(
                            Participant.id == idem.resource_id,
                            Participant.event_id == event.id,
                        )
                    )
                    if existing is None:
                        raise RuntimeError("Completed participant idempotency resource is missing.")
                    await db.commit()
                    return existing
            participant, _ = await EventParticipantMutationService.archive(
                db,
                event=event,
                participant_id=participant_id,
                actor_user_id=actor_user_id,
                source=source,
            )
            if expected_version is not None and participant.version != expected_version + 1:
                raise_version_conflict(participant.version)
            if idem is not None:
                response = ParticipantResponse.model_validate(participant)
                await complete_idempotent(
                    db, idem, response_status=200,
                    response_body=response.model_dump(mode="json"), resource_id=participant.id,
                )
            await db.commit()
            enqueue_event_registration_projection_refresh(
                organization_id=event.organization_id,
                event_id=event.id,
            )
            await cache_service.invalidate_event(event.organization_id, event.id)
            return participant
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def restore(
        db: AsyncSession,
        *,
        event: Event,
        participant_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
        expected_version: int | None = None,
    ) -> tuple[Participant, bool]:
        """Restore a participant and make the replay outcome durable."""
        try:
            idem = await begin_idempotent(
                db,
                organization_id=event.organization_id,
                actor_id=actor_user_id,
                operation="registration.participant.restore",
                key=idempotency_key,
                payload={"event_id": str(event.id), "participant_id": str(participant_id), "source": source, "expected_version": expected_version},
            )
            replay = replay_response(idem)
            if replay is not None:
                existing = await db.scalar(
                    select(Participant).options(selectinload(Participant.role_rel)).where(
                        Participant.id == idem.resource_id,
                        Participant.event_id == event.id,
                    )
                )
                if existing is None:
                    raise RuntimeError("Completed participant idempotency resource is missing.")
                await db.commit()
                return existing, bool((replay[1] or {}).get("is_free", False))
            participant, _ = await EventParticipantMutationService.restore(
                db,
                event=event,
                participant_id=participant_id,
                actor_user_id=actor_user_id,
                idempotency_key=idempotency_key,
                source=source,
                expected_version=expected_version,
            )
            payment_enabled = bool((event.registration_settings or {}).get("payment_enabled", False))
            is_free = True
            if payment_enabled:
                from app.modules.registration.services.pricing_service import get_active_prices_for_event
                prices = await get_active_prices_for_event(db, event)
                is_free = prices.get(participant.role, 0.0) <= 0
            response = ParticipantResponse.model_validate(participant)
            response.is_free = is_free
            await complete_idempotent(
                db, idem, response_status=200,
                response_body=response.model_dump(mode="json"), resource_id=participant.id,
            )
            await db.commit()
            refreshed = await db.scalar(
                select(Participant)
                .options(selectinload(Participant.role_rel))
                .where(Participant.id == participant.id, Participant.event_id == event.id)
            )
            if refreshed is None:
                raise RuntimeError("Participant disappeared after restore.")
            enqueue_event_registration_projection_refresh(
                organization_id=event.organization_id,
                event_id=event.id,
            )
            await cache_service.invalidate_event(event.organization_id, event.id)
            return refreshed, is_free
        except Exception:
            await db.rollback()
            raise
