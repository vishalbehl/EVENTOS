from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.billing.services.usage_reservation_service import (
    UsageReservationService,
)
from app.modules.events.models.event import Event
from app.modules.rbac.schemas.event import EventCreate, EventUpdate


class EventMutationService:
    """Canonical event-settings mutation shared by both administrative portals."""

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        payload: EventCreate,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
    ) -> Event:
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=organization_id,
            event_id=None,
            limit_key="max_events",
            quantity=1,
            unit="event",
            idempotency_key=f"event-create:{idempotency_key}",
            metadata={"operation": "events.create", "source": source},
        )
        existing = await db.scalar(
            select(Event.id).where(
                Event.organization_id == organization_id,
                Event.short_code == payload.short_code,
            )
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Short code '{payload.short_code}' already in use.",
            )

        event = Event(
            organization_id=organization_id,
            created_by=actor_user_id,
            **payload.model_dump_for_db(),
        )
        from app.modules.registration.models.registration_theme_setting import (
            RegistrationThemeSetting,
        )
        from app.modules.registration.routers.registration_portal import (
            DEFAULT_FAQS,
            DEFAULT_TERMS,
        )
        from app.modules.speakers.models.speaker_theme_setting import (
            DEFAULT_SPEAKER_FAQS,
            DEFAULT_SPEAKER_TERMS,
            SpeakerThemeSetting,
        )

        # Event's settings-property setters materialize these relationships
        # from the submitted payload. Seed content onto those rows instead of
        # replacing them, otherwise mode and branding choices are lost.
        if event.registration_theme_setting is None:
            event.registration_theme_setting = RegistrationThemeSetting()
        if event.speaker_theme_setting is None:
            event.speaker_theme_setting = SpeakerThemeSetting()
        if not event.registration_theme_setting.terms_and_conditions:
            event.registration_theme_setting.terms_and_conditions = DEFAULT_TERMS
        if not event.registration_theme_setting.faqs:
            event.registration_theme_setting.faqs = DEFAULT_FAQS
        if not event.speaker_theme_setting.terms_and_conditions:
            event.speaker_theme_setting.terms_and_conditions = DEFAULT_SPEAKER_TERMS
        if not event.speaker_theme_setting.faqs:
            event.speaker_theme_setting.faqs = DEFAULT_SPEAKER_FAQS
        db.add(event)
        await db.flush()

        from app.modules.registration.routers.participant_roles import (
            seed_default_roles,
        )
        # Email defaults are inherited through EmailTemplateResolver. Materializing
        # a copy here made platform fixes invisible and bypassed organisation-level
        # overrides; an event row is now created only on explicit customization.
        await seed_default_roles(event.id, db, commit=False)
        await UsageReservationService.consume(
            db,
            reservation.id,
            source=f"{source}.events.create",
            actor_user_id=actor_user_id,
        )
        await db.flush()
        return event

    @staticmethod
    async def update(
        db: AsyncSession,
        *,
        event: Event,
        payload: EventUpdate,
        actor_user_id: uuid.UUID,
    ) -> tuple[Event, dict[str, Any], list[str]]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "events.planning.manage",
            user_id=actor_user_id,
        )

        if payload.short_code and payload.short_code != event.short_code:
            existing = await db.scalar(
                select(Event.id).where(
                    Event.organization_id == event.organization_id,
                    Event.short_code == payload.short_code,
                    Event.id != event.id,
                )
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Short code '{payload.short_code}' already in use.",
                )

        update_data = payload.model_dump(exclude_unset=True)
        branding_payload = update_data.get("branding_settings")
        if branding_payload is not None:
            branding_fields = set(branding_payload)
            await enforce_event_operation(
                db,
                event.organization_id,
                event.id,
                "branding.theme.manage",
                user_id=actor_user_id,
            )
            if "theme_color" in branding_fields or any(
                "color" in field for field in branding_fields
            ):
                await enforce_event_operation(
                    db,
                    event.organization_id,
                    event.id,
                    "branding.colors.manage",
                    user_id=actor_user_id,
                )
            if any("font" in field for field in branding_fields):
                await enforce_event_operation(
                    db,
                    event.organization_id,
                    event.id,
                    "branding.fonts.manage",
                    user_id=actor_user_id,
                )
            if branding_fields & {
                "logo_url",
                "banner_url",
                "header_images",
                "favicon_url",
            }:
                await enforce_event_operation(
                    db,
                    event.organization_id,
                    event.id,
                    "branding.logo.manage",
                    user_id=actor_user_id,
                )

        for settings_field in (
            "speaker_settings",
            "registration_settings",
            "branding_settings",
        ):
            if settings_field in update_data and update_data[settings_field] is not None:
                current = dict(getattr(event, settings_field) or {})
                current.update(update_data[settings_field])
                update_data[settings_field] = current

        effective_start = update_data.get("start_date", event.start_date)
        effective_end = update_data.get("end_date", event.end_date)
        if effective_end < effective_start:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="end_date must be on or after start_date",
            )

        old_state = {
            field: getattr(event, field, None)
            for field in update_data
        }
        for field, value in update_data.items():
            setattr(event, field, value)

        if not event.speaker_mode_enabled and not event.registration_mode_enabled:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="At least one mode (Speaker or Registration) must be enabled.",
            )

        await db.flush()
        return event, old_state, sorted(update_data)
