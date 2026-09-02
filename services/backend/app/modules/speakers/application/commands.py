"""Application-owned speaker mutations."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import cache_service
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.events.models.event import Event
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.speaker_profile import SpeakerProfile
from app.modules.events.services.event_resource_mutation_service import EventResourceMutationService
from app.modules.speakers.schemas.speaker import SpeakerResponse, SpeakerUpdate
from app.schemas.common import MessageResponse
from app.modules.speakers.schemas.speaker_profile import SpeakerProfileResponse, SpeakerProfileUpdate
from app.modules.analytics.services.projection_dispatch import enqueue_event_speaker_projection_refresh


class SpeakerCommandService:
    """Own speaker update transactions; routers only resolve HTTP context."""

    @staticmethod
    async def update(
        db: AsyncSession,
        *,
        event: Event,
        speaker_id: uuid.UUID,
        payload: SpeakerUpdate,
        actor_user_id: uuid.UUID,
        expected_version: int | None = None,
        idempotency_key: str | None = None,
    ) -> SpeakerResponse:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor_user_id,
                    operation="speakers.update",
                    key=idempotency_key,
                    payload={
                        "event_id": str(event.id),
                        "speaker_id": str(speaker_id),
                        "payload": payload.model_dump(mode="json"),
                        "expected_version": expected_version,
                    },
                )
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return SpeakerResponse.model_validate(replay[1])

            await EventResourceMutationService.update_speaker(
                db,
                event=event,
                speaker_id=speaker_id,
                payload=payload,
                actor_user_id=actor_user_id,
                expected_version=expected_version,
            )
            refreshed = await db.scalar(
                select(Speaker)
                .where(
                    Speaker.id == speaker_id,
                    Speaker.event_id == event.id,
                    Speaker.deleted_at.is_(None),
                )
                .options(
                    selectinload(Speaker.profile),
                    selectinload(Speaker.track),
                    selectinload(Speaker.participant),
                )
            )
            if refreshed is None:
                raise RuntimeError("Speaker disappeared before commit.")

            response = SpeakerCommandService._response(refreshed)
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body=response.model_dump(mode="json"),
                    resource_id=refreshed.id,
                )
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
            enqueue_event_speaker_projection_refresh(
                organization_id=event.organization_id, event_id=event.id
            )
            return response
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def archive(
        db: AsyncSession,
        *,
        event: Event,
        speaker_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        expected_version: int | None = None,
        idempotency_key: str | None = None,
    ) -> MessageResponse:
        """Archive a speaker with one durable, replayable command outcome."""
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor_user_id,
                    operation="speakers.archive",
                    key=idempotency_key,
                    payload={
                        "event_id": str(event.id),
                        "speaker_id": str(speaker_id),
                        "expected_version": expected_version,
                    },
                )
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return MessageResponse.model_validate(replay[1])

            _, _outcome = await EventResourceMutationService.archive_speaker(
                db,
                event=event,
                speaker_id=speaker_id,
                actor_user_id=actor_user_id,
                source="organizer_portal",
                expected_version=expected_version,
            )
            # Preserve the legacy response contract while retaining the outcome
            # in the durable command record and audit trail.
            response = MessageResponse(message="Speaker archived and remains recoverable.")
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body=response.model_dump(mode="json"),
                    resource_id=speaker_id,
                )
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
            enqueue_event_speaker_projection_refresh(
                organization_id=event.organization_id, event_id=event.id
            )
            return response
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    def _response(speaker: Speaker) -> SpeakerResponse:
        response = SpeakerResponse.model_validate(speaker)
        response.track_id = speaker.track_id
        response.track_name = speaker.track.name if speaker.track else None
        response.track_color = getattr(speaker.track, "display_color", None) if speaker.track else None
        response.participant_id = speaker.participant_id
        response.role = getattr(speaker, "role", "Speaker") or "Speaker"
        response.roles = speaker.participant.roles if speaker.participant and speaker.participant.roles else [response.role]
        if speaker.profile:
            from app.modules.speakers.schemas.speaker_profile import SpeakerProfileResponse
            response.profile_completeness = SpeakerProfileResponse.model_validate(speaker.profile).profile_completeness
        return response

    @staticmethod
    async def upsert_profile(
        db: AsyncSession,
        *,
        event: Event,
        speaker_id: uuid.UUID,
        payload: SpeakerProfileUpdate,
        access_type: str,
        actor_user_id: uuid.UUID | None = None,
        idempotency_key: str | None = None,
    ) -> SpeakerProfileResponse:
        """Create/update a profile with one explicit application transaction."""
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor_user_id,
                    operation="speaker_profiles.upsert",
                    key=idempotency_key,
                    payload={
                        "event_id": str(event.id),
                        "speaker_id": str(speaker_id),
                        "payload": payload.model_dump(mode="json"),
                        "access_type": access_type,
                    },
                )
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return SpeakerProfileResponse.model_validate(replay[1])

            speaker = await db.scalar(
                select(Speaker).where(
                    Speaker.id == speaker_id,
                    Speaker.event_id == event.id,
                    Speaker.deleted_at.is_(None),
                )
            )
            if speaker is None:
                raise ValueError("Speaker not found in this event.")

            profile = await db.scalar(
                select(SpeakerProfile).where(
                    SpeakerProfile.speaker_id == speaker_id,
                    SpeakerProfile.event_id == event.id,
                    SpeakerProfile.organization_id == event.organization_id,
                )
            )
            values = payload.model_dump(exclude_unset=True)
            values["last_updated_by"] = access_type
            if profile is None:
                profile = SpeakerProfile(
                    speaker_id=speaker_id,
                    event_id=event.id,
                    organization_id=event.organization_id,
                    **values,
                )
                db.add(profile)
            else:
                for field, value in values.items():
                    setattr(profile, field, value)

            await db.flush()
            response = SpeakerProfileResponse.model_validate(profile)
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body=response.model_dump(mode="json"),
                    resource_id=profile.id,
                )
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
            return response
        except Exception:
            await db.rollback()
            raise
