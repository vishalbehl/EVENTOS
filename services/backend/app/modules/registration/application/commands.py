from __future__ import annotations

import uuid
from datetime import datetime, timezone
from fastapi import HTTPException, status
from sqlalchemy import delete, func, or_, select
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
)
from app.modules.registration.schemas.registration import (
    ParticipantRegistrationCreate,
    ParticipantRegistrationResponse,
)
from app.modules.registration.schemas.form_builder import (
    FormCategoryCreate,
    FormCategoryUpdate,
    FormCategoryResponse,
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
from sqlalchemy.orm import selectinload


class PricingCommandService:
    """Own pricing mutations and invalidate event reads after commit."""

    @staticmethod
    async def save_tiers(
        db: AsyncSession,
        *,
        event: Event,
        tiers: list[str],
    ) -> list[str]:
        try:
            cleaned = await TicketPricingService.set_tiers(db, event, tiers)
            await db.commit()
            await db.refresh(event)
            await cache_service.invalidate_event(event.organization_id, event.id)
            return cleaned
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def save_matrix(
        db: AsyncSession,
        *,
        event: Event,
        pricing_data: dict,
        tier_schedules: dict | None = None,
    ) -> dict:
        try:
            result = await TicketPricingService.replace_matrix(
                db,
                event,
                pricing_data,
                tier_schedules,
            )
            await db.commit()
            await db.refresh(event)
            await cache_service.invalidate_event(event.organization_id, event.id)
            return result
        except Exception:
            await db.rollback()
            raise


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
    ) -> None:
        try:
            idem = None
            if actor is not None and idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor.id,
                    operation="registration.payment_config.update",
                    key=idempotency_key,
                    # The request hash is persisted, never the credential values.
                    payload={"event_id": str(event.id), "payload": payload.model_dump(mode="json")},
                    ttl_seconds=30 * 24 * 60 * 60,
                )
                if replay_response(idem) is not None:
                    await db.commit()
                    return
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

            event.registration_settings = settings
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body={"message": "Payment configuration updated successfully."},
                )
            await db.commit()
            await db.refresh(event)
            await cache_service.invalidate_event(event.organization_id, event.id)
        except Exception:
            await db.rollback()
            raise


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
    async def update(db: AsyncSession, *, event: Event, promo_id: uuid.UUID, payload, actor, idempotency_key: str | None = None) -> PromoCode:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=actor.id, operation="registration.promo.update", key=idempotency_key, payload={"event_id": str(event.id), "promo_id": str(promo_id), "payload": payload.model_dump(mode="json")})
                replay = replay_response(idem)
                if replay is not None:
                    promo = await db.scalar(select(PromoCode).where(PromoCode.id == idem.resource_id, PromoCode.event_id == event.id))
                    if promo is None:
                        raise RuntimeError("Completed promo idempotency resource is missing.")
                    await db.commit()
                    return promo
            promo = await db.scalar(select(PromoCode).where(PromoCode.id == promo_id, PromoCode.event_id == event.id))
            if promo is None:
                raise HTTPException(status_code=404, detail="Promo code not found.")
            for field in ("is_active", "max_uses", "expiry_date"):
                value = getattr(payload, field)
                if value is not None:
                    setattr(promo, field, value)
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
    async def delete(db: AsyncSession, *, event: Event, promo_id: uuid.UUID, actor, idempotency_key: str | None = None) -> None:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=actor.id, operation="registration.promo.delete", key=idempotency_key, payload={"event_id": str(event.id), "promo_id": str(promo_id)})
                if replay_response(idem) is not None:
                    await db.commit()
                    return
            promo = await db.scalar(select(PromoCode).where(PromoCode.id == promo_id, PromoCode.event_id == event.id))
            if promo is None:
                raise HTTPException(status_code=404, detail="Promo code not found.")
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
    """Own tenant-scoped form-category mutations."""

    @staticmethod
    def _is_platform_admin(actor) -> bool:
        return bool(
            getattr(actor, "is_platform_admin", False)
            or getattr(actor, "is_superuser", False)
        )

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        payload: FormCategoryCreate,
        actor,
        idempotency_key: str | None = None,
    ) -> FormCategory:
        organization_id = getattr(actor, "organization_id", None)
        is_platform_admin = FormCategoryCommandService._is_platform_admin(actor)
        if not is_platform_admin and organization_id is None:
            raise HTTPException(status_code=403, detail="Organization context is required.")
        try:
            idem = None
            if idempotency_key and organization_id is not None:
                idem = await begin_idempotent(
                    db,
                    organization_id=organization_id,
                    actor_id=actor.id,
                    operation="registration.form_category.create",
                    key=idempotency_key,
                    payload=payload.model_dump(mode="json"),
                )
                replay = replay_response(idem)
                if replay is not None:
                    category = await db.scalar(
                        select(FormCategory).where(FormCategory.id == idem.resource_id)
                    )
                    if category is None:
                        raise RuntimeError("Completed category idempotency resource is missing.")
                    await db.commit()
                    return category

            slug = payload.slug or payload.name.lower().replace(" ", "_").replace("-", "_")
            category = FormCategory(
                id=uuid.uuid4(),
                organization_id=None if is_platform_admin else organization_id,
                name=payload.name,
                slug=slug,
                description=payload.description,
                icon=payload.icon or "ClipboardList",
                is_system=is_platform_admin,
                sort_order=payload.sort_order or 0,
                is_active=True,
            )
            db.add(category)
            await db.flush()
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=201,
                    response_body=FormCategoryResponse.model_validate(category).model_dump(mode="json"),
                    resource_id=category.id,
                )
            await db.commit()
            await db.refresh(category)
            return category
        except Exception:
            await db.rollback()
            raise


class FormTemplateCommandService:
    """Own tenant-scoped form-template mutations."""

    @staticmethod
    def _is_platform_admin(actor) -> bool:
        return bool(getattr(actor, "is_platform_admin", False) or getattr(actor, "is_superuser", False))

    @staticmethod
    def _response(template: FormTemplate) -> FormTemplateResponse:
        category = getattr(template, "category", None)
        return FormTemplateResponse(
            id=template.id,
            category_id=template.category_id,
            organization_id=template.organization_id,
            event_id=None,
            created_by=template.created_by,
            name=template.name,
            slug=template.slug,
            description=template.description,
            category_key=template.category_key,
            category_name=category.name if category else template.category_key.replace("_", " ").title(),
            scope_type=template.scope_type,
            is_default=template.is_default,
            is_system=template.is_system,
            version=template.version,
            is_active=template.is_active,
            fields=template.fields or [],
            settings=template.settings or {},
            preview_image_url=template.preview_image_url,
            created_at=template.created_at,
            updated_at=template.updated_at,
        )

    @staticmethod
    async def create(db: AsyncSession, *, payload: FormTemplateCreate, actor, idempotency_key: str | None = None) -> FormTemplate:
        is_admin = FormTemplateCommandService._is_platform_admin(actor)
        organization_id = getattr(actor, "organization_id", None)
        if organization_id is None and not is_admin:
            raise HTTPException(status_code=403, detail="Organization context is required.")
        try:
            idem = None
            if idempotency_key and organization_id is not None:
                idem = await begin_idempotent(db, organization_id=organization_id, actor_id=actor.id, operation="registration.form_template.create", key=idempotency_key, payload=payload.model_dump(mode="json"))
                replay = replay_response(idem)
                if replay is not None:
                    template = await db.scalar(select(FormTemplate).where(FormTemplate.id == idem.resource_id).options(selectinload(FormTemplate.category)))
                    if template is None:
                        raise RuntimeError("Completed template idempotency resource is missing.")
                    await db.commit()
                    return template
            scope_type = payload.scope_type or ("GLOBAL" if is_admin else "ORGANIZATION")
            template = FormTemplate(
                id=uuid.uuid4(),
                category_id=payload.category_id,
                organization_id=None if is_admin and scope_type == "GLOBAL" else organization_id,
                created_by=actor.id,
                name=payload.name,
                slug=payload.slug or payload.name.lower().replace(" ", "-").replace("_", "-"),
                description=payload.description,
                category_key=payload.category_key,
                scope_type=scope_type,
                is_default=payload.is_default if is_admin else False,
                is_system=is_admin,
                is_active=True,
                version=1,
                fields=[field.model_dump(mode="json") for field in payload.fields],
                settings=payload.settings.model_dump(mode="json") if hasattr(payload.settings, "model_dump") else (payload.settings or {}),
            )
            db.add(template)
            await db.flush()
            if idem is not None:
                await complete_idempotent(db, idem, response_status=201, response_body=FormTemplateCommandService._response(template).model_dump(mode="json"), resource_id=template.id)
            await db.commit()
            await db.refresh(template)
            return template
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def update(db: AsyncSession, *, template_id: uuid.UUID, payload: FormTemplateUpdate, actor, idempotency_key: str | None = None) -> FormTemplate:
        is_admin = FormTemplateCommandService._is_platform_admin(actor)
        organization_id = getattr(actor, "organization_id", None)
        try:
            idem = None
            if idempotency_key and organization_id is not None:
                idem = await begin_idempotent(db, organization_id=organization_id, actor_id=actor.id, operation="registration.form_template.update", key=idempotency_key, payload={"template_id": str(template_id), "payload": payload.model_dump(mode="json")})
                replay = replay_response(idem)
                if replay is not None:
                    template = await db.scalar(select(FormTemplate).where(FormTemplate.id == idem.resource_id).options(selectinload(FormTemplate.category)))
                    if template is None:
                        raise RuntimeError("Completed template idempotency resource is missing.")
                    await db.commit()
                    return template
            visibility = [FormTemplate.id == template_id, FormTemplate.deleted_at.is_(None)]
            if not is_admin:
                visibility.append(or_(FormTemplate.scope_type == "GLOBAL", FormTemplate.organization_id == organization_id))
            template = await db.scalar(select(FormTemplate).where(*visibility).options(selectinload(FormTemplate.category)))
            if template is None:
                raise HTTPException(status_code=404, detail="Form template not found")
            if template.is_system and not is_admin:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System blueprints cannot be overwritten. Duplicate the template to customize it for your organization.")
            if not is_admin and template.organization_id != organization_id:
                raise HTTPException(status_code=403, detail="Not authorized to edit this template")
            for field in ("name", "description", "category_id", "category_key", "is_active"):
                value = getattr(payload, field)
                if value is not None:
                    setattr(template, field, value)
            if payload.is_default is not None and is_admin:
                template.is_default = payload.is_default
            if payload.fields is not None:
                template.fields = [field.model_dump(mode="json") for field in payload.fields]
            if payload.settings is not None:
                template.settings = payload.settings if isinstance(payload.settings, dict) else payload.settings.model_dump(mode="json")
            template.version = int(template.version or 1) + 1
            template.updated_at = datetime.now(timezone.utc)
            await db.flush()
            if idem is not None:
                await complete_idempotent(db, idem, response_status=200, response_body=FormTemplateCommandService._response(template).model_dump(mode="json"), resource_id=template.id)
            await db.commit()
            await db.refresh(template)
            return template
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def duplicate(db: AsyncSession, *, template_id: uuid.UUID, actor, idempotency_key: str | None = None) -> FormTemplate:
        organization_id = getattr(actor, "organization_id", None)
        if organization_id is None:
            raise HTTPException(status_code=403, detail="Organization context is required.")
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(db, organization_id=organization_id, actor_id=actor.id, operation="registration.form_template.duplicate", key=idempotency_key, payload={"template_id": str(template_id)})
                replay = replay_response(idem)
                if replay is not None:
                    template = await db.scalar(select(FormTemplate).where(FormTemplate.id == idem.resource_id).options(selectinload(FormTemplate.category)))
                    if template is None:
                        raise RuntimeError("Completed template idempotency resource is missing.")
                    await db.commit()
                    return template
            source = await db.scalar(select(FormTemplate).where(FormTemplate.id == template_id, FormTemplate.deleted_at.is_(None), or_(FormTemplate.scope_type == "GLOBAL", FormTemplate.organization_id == organization_id)))
            if source is None:
                raise HTTPException(status_code=404, detail="Source template not found")
            clone = FormTemplate(id=uuid.uuid4(), category_id=source.category_id, organization_id=organization_id, created_by=actor.id, name=f"{source.name} (Custom Copy)", slug=f"{source.slug}-copy-{uuid.uuid4().hex[:6]}", description=source.description, category_key=source.category_key, scope_type="ORGANIZATION", is_default=False, is_system=False, is_active=True, version=1, fields=source.fields or [], settings=source.settings or {})
            db.add(clone)
            await db.flush()
            if idem is not None:
                await complete_idempotent(db, idem, response_status=201, response_body=FormTemplateCommandService._response(clone).model_dump(mode="json"), resource_id=clone.id)
            await db.commit()
            await db.refresh(clone)
            return clone
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def delete(db: AsyncSession, *, template_id: uuid.UUID, actor, idempotency_key: str | None = None) -> None:
        organization_id = getattr(actor, "organization_id", None)
        try:
            idem = None
            if idempotency_key and organization_id is not None:
                idem = await begin_idempotent(db, organization_id=organization_id, actor_id=actor.id, operation="registration.form_template.delete", key=idempotency_key, payload={"template_id": str(template_id)})
                if replay_response(idem) is not None:
                    await db.commit()
                    return
            template = await db.scalar(select(FormTemplate).where(FormTemplate.id == template_id, FormTemplate.organization_id == organization_id, FormTemplate.deleted_at.is_(None)))
            if template is None:
                raise HTTPException(status_code=404, detail="Form template not found")
            if template.is_system:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System templates cannot be deleted by organizers.")
            template.deleted_at = datetime.now(timezone.utc)
            template.deleted_by = actor.id
            await db.flush()
            if idem is not None:
                await complete_idempotent(db, idem, response_status=204, response_body={})
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def update(
        db: AsyncSession,
        *,
        category_id: uuid.UUID,
        payload: FormCategoryUpdate,
        actor,
        idempotency_key: str | None = None,
    ) -> FormCategory:
        organization_id = getattr(actor, "organization_id", None)
        is_platform_admin = FormCategoryCommandService._is_platform_admin(actor)
        try:
            idem = None
            if idempotency_key and organization_id is not None:
                idem = await begin_idempotent(
                    db,
                    organization_id=organization_id,
                    actor_id=actor.id,
                    operation="registration.form_category.update",
                    key=idempotency_key,
                    payload={"category_id": str(category_id), "payload": payload.model_dump(mode="json")},
                )
                replay = replay_response(idem)
                if replay is not None:
                    category = await db.scalar(select(FormCategory).where(FormCategory.id == idem.resource_id))
                    if category is None:
                        raise RuntimeError("Completed category idempotency resource is missing.")
                    await db.commit()
                    return category

            conditions = [FormCategory.id == category_id, FormCategory.deleted_at.is_(None)]
            if not is_platform_admin:
                conditions.append(FormCategory.organization_id == organization_id)
            category = await db.scalar(select(FormCategory).where(*conditions))
            if category is None:
                raise HTTPException(status_code=404, detail="Form category not found")
            if category.is_system and not is_platform_admin:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System categories are protected by Command Center governance and cannot be modified by organizers.")
            for field in ("name", "description", "icon", "sort_order", "is_active"):
                value = getattr(payload, field)
                if value is not None:
                    setattr(category, field, value)
            await db.flush()
            if idem is not None:
                await complete_idempotent(db, idem, response_status=200, response_body=FormCategoryResponse.model_validate(category).model_dump(mode="json"), resource_id=category.id)
            await db.commit()
            await db.refresh(category)
            return category
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def delete(
        db: AsyncSession,
        *,
        category_id: uuid.UUID,
        actor,
        idempotency_key: str | None = None,
    ) -> None:
        organization_id = getattr(actor, "organization_id", None)
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=organization_id,
                    actor_id=actor.id,
                    operation="registration.form_category.delete",
                    key=idempotency_key,
                    payload={"category_id": str(category_id)},
                )
                if replay_response(idem) is not None:
                    await db.commit()
                    return
            category = await db.scalar(
                select(FormCategory).where(
                    FormCategory.id == category_id,
                    FormCategory.organization_id == organization_id,
                    FormCategory.deleted_at.is_(None),
                )
            )
            if category is None:
                raise HTTPException(status_code=404, detail="Form category not found")
            if category.is_system:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System categories are permanent platform categories and cannot be deleted.")
            category.deleted_at = datetime.now(timezone.utc)
            category.deleted_by = actor.id
            await db.flush()
            if idem is not None:
                await complete_idempotent(db, idem, response_status=204, response_body={})
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def save_matrix(
        db: AsyncSession,
        *,
        event: Event,
        pricing_data: dict,
        tier_schedules: dict | None = None,
    ) -> dict[str, float]:
        try:
            normalized = await TicketPricingService.replace_matrix(
                db,
                event,
                pricing_data,
                tier_schedules=tier_schedules,
            )
            await db.commit()
            await db.refresh(event)
            await cache_service.invalidate_event(event.organization_id, event.id)
            return normalized
        except Exception:
            await db.rollback()
            raise


class RegistrationFormCommandService:
    """Own the transaction for organizer registration-form configuration."""

    @staticmethod
    async def update(
        db: AsyncSession,
        *,
        event: Event,
        payload: RegistrationFormConfigUpdate,
        if_match: str | None = None,
        actor_user_id: uuid.UUID | None = None,
        idempotency_key: str | None = None,
    ) -> RegistrationFormConfig:
        try:
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
                        "if_match": if_match,
                    },
                )
                replay = replay_response(idem)
                if replay is not None:
                    if idem.resource_id is None:
                        raise RuntimeError("Completed form idempotency record has no resource.")
                    existing = await db.scalar(
                        select(RegistrationFormConfig).where(
                            RegistrationFormConfig.id == idem.resource_id,
                            RegistrationFormConfig.event_id == event.id,
                        )
                    )
                    if existing is None:
                        raise RuntimeError("Completed form idempotency resource is missing.")
                    await db.commit()
                    await db.refresh(existing)
                    return existing

            config = await RegistrationFormCommandService._update(
                db, event=event, payload=payload, if_match=if_match
            )
            # The application command owns the single transaction boundary.
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body={"id": str(config.id), "version": config.version},
                    resource_id=config.id,
                )
            await db.commit()
            await db.refresh(config)
            await cache_service.invalidate_event(event.organization_id, event.id)
            return config
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def _update(
        db: AsyncSession,
        *,
        event: Event,
        payload: RegistrationFormConfigUpdate,
        if_match: str | None = None,
    ) -> RegistrationFormConfig:
        result = await db.execute(
            select(RegistrationFormConfig).where(
                RegistrationFormConfig.event_id == event.id
            )
        )
        config = result.scalar_one_or_none()

        if config is None:
            if if_match:
                require_if_match(if_match)
            config = RegistrationFormConfig(event_id=event.id)
            db.add(config)
            await db.flush()
        elif if_match:
            expected_version = require_if_match(if_match)
            current_version = int(config.version or 1)
            if current_version != expected_version:
                raise_version_conflict(current_version)

        # Setup is an authenticated command. Public reads never create roles.
        existing_role = await db.scalar(
            select(ParticipantRole.id)
            .where(ParticipantRole.event_id == event.id)
            .limit(1)
        )
        if existing_role is None:
            db.add(
                ParticipantRole(
                    event_id=event.id,
                    category="General",
                    name="Delegate",
                    role_code="DEL",
                    is_active=True,
                    is_default=True,
                    sort_order=0,
                )
            )

        if payload.is_live is not None:
            config.is_live = payload.is_live

        if payload.template_id is not None:
            if isinstance(payload.template_id, uuid.UUID):
                config.template_id = payload.template_id
            elif isinstance(payload.template_id, str):
                try:
                    config.template_id = uuid.UUID(payload.template_id)
                except ValueError:
                    # Look up template by slug to resolve UUID if possible
                    tpl = await db.scalar(
                        select(FormTemplate.id).where(
                            FormTemplate.slug == payload.template_id,
                            FormTemplate.deleted_at.is_(None),
                        ).limit(1)
                    )
                    config.template_id = tpl

        if payload.category_id is not None:
            config.category_id = payload.category_id

        if payload.settings is not None:
            config.settings = payload.settings

        if payload.fields is not None:
            fields = [
                field.model_dump() if hasattr(field, "model_dump") else dict(field)
                for field in payload.fields
            ]
            config.fields = fields
            await db.execute(delete(FormField).where(FormField.form_id == config.id))

            sort_index = 0
            has_state = False
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
        event.registration_settings = registration_settings

        config.version = int(config.version or 1) + 1
        return config


class ParticipantCommandService:
    """Own participant mutation transactions while reusing domain rules."""

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
    ) -> tuple[Participant, bool]:
        """Restore a participant and make the replay outcome durable."""
        try:
            idem = await begin_idempotent(
                db,
                organization_id=event.organization_id,
                actor_id=actor_user_id,
                operation="registration.participant.restore",
                key=idempotency_key,
                payload={"event_id": str(event.id), "participant_id": str(participant_id), "source": source},
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
