from __future__ import annotations

import hashlib
import asyncio
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Response, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import delete, func, select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.concurrency import require_if_match, raise_version_conflict
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.dependencies import ActiveUser, CurrentEvent, OrganizerOrAbove, get_db
from app.modules.identity.models.user import User
from app.modules.programme.models import ProgrammeAccessGrant, ProgrammeEvaluationPlan, ProgrammeMembership, ProgrammeSchedulePublication
from app.modules.programme.queries import ProgrammeQueryService
from app.modules.programme.schemas import (
    ProgrammeAccessGrantCreate, ProgrammeAccessGrantIssued, ProgrammeAccessGrantResponse,
    ProgrammeEvaluationPlanApply, ProgrammeEvaluationPlanApplyResult, ProgrammeEvaluationPlanCreate, ProgrammeEvaluationPlanResponse, ProgrammeEvaluationPlanUpdate,
    ProgrammeLifecycleResponse, ProgrammeMembershipCreate, ProgrammeMembershipResponse, PublicAbstractAuthor,
    PublicAbstractCallResponse, PublicAbstractSubmissionCreate, PublicAbstractSubmissionUpdate, PublicAbstractSubmissionResponse, PublicAbstractAttachmentCreate,
    PublicReviewerAssignment, PublicReviewerConflict, PublicReviewerConflictResult, PublicReviewerReview,
    ProgrammeSpeakerProfileUpdate, ProgrammeSpeakerPortalResponse,
)
from app.modules.abstracts.models import (
    AbstractAssignment, AbstractAuthor, AbstractCall, AbstractCategory, AbstractDecision,
    AbstractForm, AbstractFormat, AbstractPortalSettings, AbstractReview, AbstractReviewer,
    AbstractSubmission, AbstractTopic,
)
from app.modules.events.models.event import Event
from app.modules.events.models.speaker import Speaker
from app.modules.agenda.models import Session, Room, Track, SessionPerson
from app.modules.presentations.models.presentation_file import PresentationFile
from app.config import settings
from app.services import upload_service
from app.modules.registration.schemas.event_form_contracts import abstract_schema_projection, evaluation_rubric_projection

router = APIRouter(prefix="/events/{event_id}/programme", tags=["programme"])
public_router = APIRouter(prefix="/programme", tags=["programme-public"])


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


@router.get("/lifecycle", response_model=ProgrammeLifecycleResponse)
async def programme_lifecycle(event: CurrentEvent, db: AsyncSession = Depends(get_db)) -> ProgrammeLifecycleResponse:
    data = await ProgrammeQueryService(db).lifecycle(event_id=event.id, organization_id=event.organization_id)
    return ProgrammeLifecycleResponse(event_id=event.id, **data.__dict__)


@router.get("/memberships", response_model=list[ProgrammeMembershipResponse])
async def list_memberships(event: CurrentEvent, _: OrganizerOrAbove, db: AsyncSession = Depends(get_db)) -> list[ProgrammeMembershipResponse]:
    return [ProgrammeMembershipResponse.model_validate(row) for row in await ProgrammeQueryService(db).memberships(event_id=event.id)]


@router.post("/memberships", response_model=ProgrammeMembershipResponse, status_code=status.HTTP_201_CREATED)
async def create_membership(
    payload: ProgrammeMembershipCreate,
    event: CurrentEvent,
    user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> ProgrammeMembershipResponse:
    key = idempotency_key or f"programme-membership:{uuid.uuid4()}"
    try:
        idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=user.id, operation="programme.membership.create", key=key, payload=payload.model_dump(mode="json"))
        if replay_response(idem):
            member = await db.get(ProgrammeMembership, idem.resource_id)
            if member is None:
                raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESOURCE_MISSING", "message": "Membership replay target is unavailable."})
            await db.commit()
            return ProgrammeMembershipResponse.model_validate(member)
        member = ProgrammeMembership(
            organization_id=event.organization_id, event_id=event.id, email=str(payload.email).lower(),
            display_name=payload.display_name.strip(), role=payload.role, anonymous_review=payload.anonymous_review,
            expertise_topics=[topic.strip() for topic in payload.expertise_topics if topic.strip()], capacity=payload.capacity,
            invited_at=datetime.now(timezone.utc),
        )
        db.add(member)
        await db.flush()
        await complete_idempotent(db, idem, response_status=201, response_body={"resource_id": str(member.id)}, resource_id=member.id)
        await db.commit()
        return ProgrammeMembershipResponse.model_validate(member)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": "PROGRAMME_MEMBERSHIP_EXISTS", "message": "This person already has a programme role for the event."}) from exc
    except Exception:
        await db.rollback()
        raise


@router.get("/evaluation-plans", response_model=list[ProgrammeEvaluationPlanResponse])
async def list_evaluation_plans(event: CurrentEvent, _: ActiveUser, response: Response, db: AsyncSession = Depends(get_db)) -> list[ProgrammeEvaluationPlanResponse]:
    from app.modules.rbac.services.access_contexts import actor_request_context
    async with actor_request_context(db, _.id, event.organization_id, event_id=event.id, action="SPEAKERS:VIEW"):
        rows = await ProgrammeQueryService(db).evaluation_plans(event_id=event.id, organization_id=event.organization_id)
        from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation as Evidence
        if rows and await db.scalar(select(Evidence.id).where(Evidence.organization_id == event.organization_id,
            Evidence.resource_type == "PROGRAMME_RUBRIC", Evidence.operation == "DOCUMENT_VALIDATION",
            Evidence.status == "BLOCKED", tuple_(Evidence.resource_id, Evidence.resource_version).in_(
                [(row.id, int(row.version or 1)) for row in rows])).limit(1)) is not None:
            raise HTTPException(503, detail={"code": "EVALUATION_RUBRIC_UNAVAILABLE"}, headers={"Cache-Control": "no-store"})
    response.headers["Cache-Control"] = "no-store"
    try:
        return [ProgrammeEvaluationPlanResponse.model_validate(row) for row in rows]
    except ValidationError:
        # Never return raw historical criteria/filters in a validation error or
        # invent replacement scoring definitions to make this read succeed.
        raise HTTPException(503, detail={"code": "EVALUATION_RUBRIC_UNAVAILABLE"},
            headers={"Cache-Control": "no-store"}) from None


@router.post("/evaluation-plans", response_model=ProgrammeEvaluationPlanResponse, status_code=status.HTTP_201_CREATED)
async def create_evaluation_plan(
    payload: ProgrammeEvaluationPlanCreate, event: CurrentEvent, user: ActiveUser,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> ProgrammeEvaluationPlanResponse:
    from app.modules.programme.evaluation_commands import EvaluationPlanCommands
    return await EvaluationPlanCommands.execute(db, operation="create", payload=payload,
        event=event, user=user, idempotency_key=idempotency_key)


@router.put("/evaluation-plans/{plan_id}", response_model=ProgrammeEvaluationPlanResponse)
async def update_evaluation_plan(
    plan_id: uuid.UUID, payload: ProgrammeEvaluationPlanUpdate, event: CurrentEvent, user: ActiveUser,
    db: AsyncSession = Depends(get_db),
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> ProgrammeEvaluationPlanResponse:
    from app.modules.programme.evaluation_commands import EvaluationPlanCommands
    return await EvaluationPlanCommands.execute(db, operation="update", payload=payload,
        event=event, user=user, plan_id=plan_id, if_match=if_match, idempotency_key=idempotency_key)


@router.post("/evaluation-plans/{plan_id}/apply", response_model=ProgrammeEvaluationPlanApplyResult)
async def apply_evaluation_plan(
    plan_id: uuid.UUID, payload: ProgrammeEvaluationPlanApply, event: CurrentEvent, user: ActiveUser,
    db: AsyncSession = Depends(get_db),
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> ProgrammeEvaluationPlanApplyResult:
    from app.modules.programme.evaluation_commands import EvaluationPlanCommands
    return await EvaluationPlanCommands.execute(db, operation="apply", payload=payload,
        event=event, user=user, plan_id=plan_id, if_match=if_match, idempotency_key=idempotency_key)


@router.post("/access-grants", response_model=ProgrammeAccessGrantIssued, status_code=status.HTTP_201_CREATED)
async def issue_access_grant(
    payload: ProgrammeAccessGrantCreate,
    event: CurrentEvent,
    user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> ProgrammeAccessGrantIssued:
    key = idempotency_key or f"programme-access-grant:{uuid.uuid4()}"
    raw_token = secrets.token_urlsafe(32)
    try:
        idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=user.id, operation="programme.access_grant.issue", key=key, payload=payload.model_dump(mode="json"))
        if replay_response(idem):
            # Raw tokens are deliberately non-recoverable. A replay returns grant metadata only.
            raise HTTPException(status_code=409, detail={"code": "ACCESS_GRANT_REPLAY_REQUIRES_RESEND", "message": "The access link was already issued. Create a replacement grant to resend it."})
        grant = ProgrammeAccessGrant(
            organization_id=event.organization_id, event_id=event.id, audience=payload.audience, email=str(payload.email).lower(),
            token_hash=_hash_token(raw_token), resource_type=payload.resource_type, resource_id=payload.resource_id,
            permissions=payload.permissions, expires_at=datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days), created_by=user.id,
        )
        db.add(grant)
        await db.flush()
        await complete_idempotent(db, idem, response_status=201, response_body={"resource_id": str(grant.id)}, resource_id=grant.id)
        await db.commit()
        return ProgrammeAccessGrantIssued(**ProgrammeAccessGrantResponse.model_validate(grant).model_dump(), access_token=raw_token)
    except Exception:
        await db.rollback()
        raise


@router.post("/speaker-invitations/{speaker_id}", response_model=ProgrammeAccessGrantIssued, status_code=status.HTTP_201_CREATED)
async def issue_speaker_invitation(
    speaker_id: uuid.UUID,
    event: CurrentEvent,
    user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> ProgrammeAccessGrantIssued:
    """Issue a revocable, event-scoped speaker programme link.

    The raw token is returned only at issuance time; the database stores its
    SHA-256 hash. Sending is deliberately owned by the notification layer so
    tests can use a provider double without sending a real message.
    """
    speaker = await db.scalar(select(Speaker).where(
        Speaker.id == speaker_id, Speaker.event_id == event.id, Speaker.deleted_at.is_(None)
    ))
    if speaker is None:
        raise HTTPException(status_code=404, detail={"code": "SPEAKER_NOT_FOUND", "message": "Speaker is not part of this event."})
    key = idempotency_key or f"programme-speaker-invitation:{speaker_id}:{uuid.uuid4()}"
    raw_token = secrets.token_urlsafe(32)
    try:
        idem = await begin_idempotent(
            db, organization_id=event.organization_id, actor_id=user.id,
            operation="programme.speaker_invitation.issue", key=key,
            payload={"speaker_id": str(speaker_id), "email": speaker.email},
        )
        if replay_response(idem):
            raise HTTPException(status_code=409, detail={"code": "ACCESS_GRANT_REPLAY_REQUIRES_RESEND", "message": "The invitation was already issued. Create a replacement grant to resend it."})
        grant = ProgrammeAccessGrant(
            organization_id=event.organization_id, event_id=event.id,
            audience="SPEAKER", email=speaker.email.lower(), token_hash=_hash_token(raw_token),
            resource_type="SPEAKER", resource_id=speaker.id,
            permissions={"profile": True, "participation": True, "sessions": True},
            expires_at=datetime.now(timezone.utc) + timedelta(days=14), created_by=user.id,
        )
        db.add(grant)
        await db.flush()
        await complete_idempotent(db, idem, response_status=201, response_body={"resource_id": str(grant.id)}, resource_id=grant.id)
        await db.commit()
        return ProgrammeAccessGrantIssued(**ProgrammeAccessGrantResponse.model_validate(grant).model_dump(), access_token=raw_token)
    except Exception:
        await db.rollback()
        raise


@router.get("/access-grants", response_model=list[ProgrammeAccessGrantResponse])
async def list_access_grants(
    event: CurrentEvent,
    _: OrganizerOrAbove,
    audience: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[ProgrammeAccessGrantResponse]:
    statement = select(ProgrammeAccessGrant).where(
        ProgrammeAccessGrant.event_id == event.id,
        ProgrammeAccessGrant.organization_id == event.organization_id,
    )
    if audience:
        statement = statement.where(ProgrammeAccessGrant.audience == audience.upper())
    rows = list((await db.scalars(statement.order_by(ProgrammeAccessGrant.created_at.desc()).limit(500))).all())
    return [ProgrammeAccessGrantResponse.model_validate(row) for row in rows]


@router.post("/reviewer-invitations/{reviewer_id}", response_model=ProgrammeAccessGrantIssued, status_code=status.HTTP_201_CREATED)
async def issue_reviewer_invitation(
    reviewer_id: uuid.UUID,
    event: CurrentEvent,
    user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> ProgrammeAccessGrantIssued:
    reviewer = await db.scalar(select(AbstractReviewer).where(
        AbstractReviewer.id == reviewer_id, AbstractReviewer.event_id == event.id,
        AbstractReviewer.organization_id == event.organization_id,
    ))
    if reviewer is None:
        raise HTTPException(status_code=404, detail={"code": "REVIEWER_NOT_FOUND"})
    key = idempotency_key or f"programme-reviewer-invitation:{reviewer_id}:{uuid.uuid4()}"
    raw_token = secrets.token_urlsafe(32)
    try:
        idem = await begin_idempotent(
            db, organization_id=event.organization_id, actor_id=user.id,
            operation="programme.reviewer_invitation.issue", key=key,
            payload={"reviewer_id": str(reviewer_id), "email": reviewer.email},
        )
        if replay_response(idem):
            raise HTTPException(status_code=409, detail={"code": "ACCESS_GRANT_REPLAY_REQUIRES_RESEND"})
        grant = ProgrammeAccessGrant(
            organization_id=event.organization_id, event_id=event.id,
            audience="REVIEWER", email=reviewer.email.lower(), token_hash=_hash_token(raw_token),
            resource_type="ABSTRACT_REVIEWER", resource_id=reviewer.id,
            permissions={"anonymous_review": bool((await db.scalar(select(AbstractCall.blind_review_enabled).where(AbstractCall.event_id == event.id))) or False)},
            expires_at=datetime.now(timezone.utc) + timedelta(days=14), created_by=user.id,
        )
        db.add(grant)
        reviewer.access_token_hash = _hash_token(raw_token)
        reviewer.invited_at = datetime.now(timezone.utc)
        await db.flush()
        await complete_idempotent(db, idem, response_status=201, response_body={"resource_id": str(grant.id)}, resource_id=grant.id)
        await db.commit()
        return ProgrammeAccessGrantIssued(**ProgrammeAccessGrantResponse.model_validate(grant).model_dump(), access_token=raw_token)
    except Exception:
        await db.rollback()
        raise


@router.post("/access-grants/{grant_id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_access_grant(
    grant_id: uuid.UUID,
    event: CurrentEvent,
    user: OrganizerOrAbove,
    if_match: str = Header(..., alias="If-Match"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    expected = require_if_match(if_match)
    grant = await db.scalar(select(ProgrammeAccessGrant).where(
        ProgrammeAccessGrant.id == grant_id, ProgrammeAccessGrant.event_id == event.id,
        ProgrammeAccessGrant.organization_id == event.organization_id,
    ).with_for_update())
    if grant is None:
        raise HTTPException(status_code=404, detail={"code": "ACCESS_GRANT_NOT_FOUND", "message": "Access grant was not found."})
    if grant.version != expected:
        raise_version_conflict(grant.version)
    grant.status = "REVOKED"
    grant.revoked_at = datetime.now(timezone.utc)
    grant.version += 1
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@public_router.get("/access/{token}")
async def inspect_access_grant(token: str, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    """Return only non-sensitive grant scope so portal clients can select a safe flow."""
    grant = await db.scalar(select(ProgrammeAccessGrant).where(ProgrammeAccessGrant.token_hash == _hash_token(token)))
    now = datetime.now(timezone.utc)
    if grant is None or grant.status != "ACTIVE" or grant.expires_at <= now:
        raise HTTPException(status_code=404, detail={"code": "ACCESS_GRANT_UNAVAILABLE", "message": "This programme access link is unavailable."})
    return {"audience": grant.audience, "event_id": str(grant.event_id), "resource_type": grant.resource_type, "resource_id": str(grant.resource_id) if grant.resource_id else None, "expires_at": grant.expires_at}


async def _speaker_grant(token: str, db: AsyncSession, *, lock: bool = False) -> ProgrammeAccessGrant:
    statement = select(ProgrammeAccessGrant).where(
        ProgrammeAccessGrant.token_hash == _hash_token(token),
        ProgrammeAccessGrant.audience == "SPEAKER",
        ProgrammeAccessGrant.resource_type == "SPEAKER",
        ProgrammeAccessGrant.status == "ACTIVE",
        ProgrammeAccessGrant.expires_at > datetime.now(timezone.utc),
    )
    if lock:
        statement = statement.with_for_update()
    grant = await db.scalar(statement)
    if grant is None or grant.resource_id is None:
        raise HTTPException(status_code=404, detail={"code": "SPEAKER_ACCESS_UNAVAILABLE", "message": "This speaker access link is unavailable."})
    return grant


async def _speaker_portal_response(grant: ProgrammeAccessGrant, db: AsyncSession) -> ProgrammeSpeakerPortalResponse:
    speaker = await db.scalar(select(Speaker).where(
        Speaker.id == grant.resource_id, Speaker.organization_id == grant.organization_id, Speaker.event_id == grant.event_id,
        Speaker.deleted_at.is_(None),
    ).options(
        selectinload(Speaker.event),
        selectinload(Speaker.session_speakers).selectinload(SessionPerson.session).selectinload(Session.room),
        selectinload(Speaker.presentation_files),
    ))
    if speaker is None:
        raise HTTPException(status_code=404, detail={"code": "SPEAKER_NOT_FOUND", "message": "The speaker profile is no longer available."})
    assignments = list(speaker.session_speakers)
    sessions = [{
        "id": assignment.session.id, "code": assignment.session.session_code,
        "title": assignment.session.name, "start_time": assignment.session.start_time,
        "end_time": assignment.session.end_time, "room": assignment.session.room.name if assignment.session.room else None,
        "role": assignment.role, "presentation_title": assignment.presentation_title,
        "is_confirmed": assignment.is_confirmed,
    } for assignment in assignments if assignment.session is not None]
    state = str((grant.permissions or {}).get("participation") or "PENDING")
    if assignments and all(assignment.is_confirmed for assignment in assignments):
        state = "ACCEPTED"
    files = [{
        "id": file.id, "session_speaker_id": file.session_speaker_id,
        "filename": file.original_filename, "format": file.file_format,
        "version": file.version_number, "status": file.upload_status,
        "is_current": file.is_current_version, "is_locked": file.is_locked,
        "uploaded_at": file.uploaded_at,
    } for file in speaker.presentation_files if file.event_id == grant.event_id and file.is_current_version]
    return ProgrammeSpeakerPortalResponse(
        speaker_id=speaker.id, event_id=speaker.event_id, event_name=speaker.event.name if speaker.event else "",
        first_name=speaker.first_name, last_name=speaker.last_name, email=speaker.email,
        designation=speaker.designation, affiliation=speaker.affiliation, country=speaker.country,
        bio=speaker.bio, photo_url=speaker.photo_url, social_links=speaker.social_links,
        research_interests=speaker.research_interests or [], programme_availability=speaker.programme_availability or {},
        programme_custom_fields=speaker.programme_custom_fields or {}, programme_travel_details=speaker.programme_travel_details or {},
        version=int(speaker.version or 1),
        participation=state, sessions=sessions, files=files,
    )


@public_router.get("/access/{token}/speaker", response_model=ProgrammeSpeakerPortalResponse)
async def speaker_programme_portal(token: str, db: AsyncSession = Depends(get_db)) -> ProgrammeSpeakerPortalResponse:
    grant = await _speaker_grant(token, db)
    return await _speaker_portal_response(grant, db)


@public_router.patch("/access/{token}/speaker/profile", response_model=ProgrammeSpeakerPortalResponse)
async def update_speaker_programme_profile(
    token: str, payload: ProgrammeSpeakerProfileUpdate, db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> ProgrammeSpeakerPortalResponse:
    grant = await _speaker_grant(token, db, lock=True)
    speaker = await db.scalar(select(Speaker).where(
        Speaker.id == grant.resource_id, Speaker.event_id == grant.event_id, Speaker.deleted_at.is_(None),
    ).with_for_update())
    if speaker is None:
        raise HTTPException(status_code=404, detail={"code": "SPEAKER_NOT_FOUND"})
    key = idempotency_key or f"programme-speaker-profile:{grant.id}:{payload.expected_version}"
    idem = await begin_idempotent(
        db,
        organization_id=grant.organization_id,
        actor_id=None,
        operation="programme.speaker_profile.update",
        key=key,
        payload={"grant_id": str(grant.id), "payload": payload.model_dump(mode="json")},
    )
    if replay_response(idem):
        await db.commit()
        return await _speaker_portal_response(grant, db)
    if int(speaker.version or 1) != payload.expected_version:
        raise_version_conflict(int(speaker.version or 1))
    speaker.first_name, speaker.last_name = payload.first_name.strip(), payload.last_name.strip()
    speaker.designation, speaker.affiliation, speaker.country = payload.designation, payload.affiliation, payload.country
    speaker.bio, speaker.photo_url = payload.bio, payload.photo_url
    speaker.social_links, speaker.research_interests = payload.social_links, payload.research_interests
    if payload.programme_availability is not None:
        speaker.programme_availability = payload.programme_availability
    if payload.programme_custom_fields is not None:
        speaker.programme_custom_fields = payload.programme_custom_fields
    if payload.programme_travel_details is not None:
        speaker.programme_travel_details = payload.programme_travel_details
    speaker.version = int(speaker.version or 1) + 1
    await complete_idempotent(
        db,
        idem,
        response_status=200,
        response_body={"speaker_id": str(speaker.id), "version": speaker.version},
        resource_id=speaker.id,
    )
    await db.commit()
    return await _speaker_portal_response(grant, db)


@public_router.post("/access/{token}/speaker/headshot", response_model=ProgrammeSpeakerPortalResponse)
async def upload_speaker_programme_headshot(
    token: str,
    file: UploadFile = File(...),
    if_match: str = Header(..., alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
) -> ProgrammeSpeakerPortalResponse:
    """Upload a grant-scoped headshot without exposing the legacy upload token."""
    grant = await _speaker_grant(token, db, lock=True)
    speaker = await db.scalar(select(Speaker).where(
        Speaker.id == grant.resource_id, Speaker.organization_id == grant.organization_id,
        Speaker.event_id == grant.event_id,
        Speaker.deleted_at.is_(None),
    ).with_for_update())
    if speaker is None:
        raise HTTPException(status_code=404, detail={"code": "SPEAKER_NOT_FOUND"})
    expected = require_if_match(if_match)
    if int(speaker.version or 1) != expected:
        raise_version_conflict(int(speaker.version or 1))
    content_type = (file.content_type or "").lower()
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=422, detail={"code": "HEADSHOT_TYPE_UNSUPPORTED", "message": "Use JPEG, PNG, or WebP."})
    contents = await file.read()
    if not contents or len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail={"code": "HEADSHOT_TOO_LARGE", "message": "Headshots must be between 1 byte and 10 MB."})
    key = idempotency_key or f"programme-speaker-headshot:{grant.id}:{expected}:{hashlib.sha256(contents).hexdigest()[:16]}"
    idem = await begin_idempotent(
        db,
        organization_id=grant.organization_id,
        actor_id=None,
        operation="programme.speaker_headshot.upload",
        key=key,
        payload={"grant_id": str(grant.id), "expected_version": expected, "sha256": hashlib.sha256(contents).hexdigest()},
    )
    if replay_response(idem):
        await db.commit()
        return await _speaker_portal_response(grant, db)
    extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[content_type]
    storage_path = f"{grant.organization_id}/{grant.event_id}/speakers/{speaker.id}/programme-headshot.{extension}"
    try:
        await asyncio.to_thread(
            upload_service.upload_bytes,
            bucket=settings.S3_BUCKET_ASSETS,
            storage_path=storage_path,
            data=contents,
            content_type=content_type,
        )
        speaker.photo_url = await asyncio.to_thread(
            upload_service.create_presigned_download,
            bucket=settings.S3_BUCKET_ASSETS,
            storage_path=storage_path,
            inline=True,
        )
        speaker.version = int(speaker.version or 1) + 1
        await complete_idempotent(
            db,
            idem,
            response_status=200,
            response_body={"speaker_id": str(speaker.id), "version": speaker.version},
            resource_id=speaker.id,
        )
        await db.commit()
        return await _speaker_portal_response(grant, db)
    except Exception:
        await db.rollback()
        raise


@public_router.post("/access/{token}/speaker/participation", response_model=ProgrammeSpeakerPortalResponse)
async def update_speaker_programme_participation(
    token: str, accepted: bool = True, db: AsyncSession = Depends(get_db),
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> ProgrammeSpeakerPortalResponse:
    grant = await _speaker_grant(token, db, lock=True)
    speaker = await db.scalar(select(Speaker).where(
        Speaker.id == grant.resource_id, Speaker.event_id == grant.event_id, Speaker.deleted_at.is_(None),
    ).options(selectinload(Speaker.session_speakers)).with_for_update())
    if speaker is None:
        raise HTTPException(status_code=404, detail={"code": "SPEAKER_NOT_FOUND"})
    if if_match is not None and int(speaker.version or 1) != require_if_match(if_match):
        raise_version_conflict(int(speaker.version or 1))
    key = idempotency_key or f"programme-speaker-participation:{grant.id}:{accepted}"
    idem = await begin_idempotent(
        db, organization_id=grant.organization_id, actor_id=None,
        operation="programme.speaker_participation.update", key=key,
        payload={"grant_id": str(grant.id), "accepted": accepted},
    )
    if replay_response(idem):
        await db.commit()
        return await _speaker_portal_response(grant, db)
    for assignment in speaker.session_speakers:
        assignment.is_confirmed = accepted
    grant.permissions = {**(grant.permissions or {}), "participation": "ACCEPTED" if accepted else "DECLINED"}
    grant.version = int(grant.version or 1) + 1
    speaker.version = int(speaker.version or 1) + 1
    await complete_idempotent(db, idem, response_status=200, response_body={"accepted": accepted, "speaker_id": str(speaker.id)}, resource_id=speaker.id)
    await db.commit()
    return await _speaker_portal_response(grant, db)


@public_router.get("/events/{event_id}/call-for-abstracts", response_model=PublicAbstractCallResponse)
async def public_abstract_call(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> PublicAbstractCallResponse:
    """Unauthenticated read model for a published, currently open author call."""
    now = datetime.now(timezone.utc)
    event = await db.scalar(select(Event).where(Event.id == event_id, Event.deleted_at.is_(None)))
    call = await db.scalar(select(AbstractCall).where(AbstractCall.event_id == event_id, AbstractCall.status == "OPEN"))
    if event is None or call is None or (call.opens_at and call.opens_at > now) or (call.closes_at and call.closes_at < now):
        raise HTTPException(status_code=404, detail={"code": "ABSTRACT_CALL_UNAVAILABLE", "message": "This call for abstracts is not currently open."})

    form = await db.scalar(select(AbstractForm).where(
        AbstractForm.event_id == event_id, AbstractForm.is_active.is_(True), AbstractForm.published_at.is_not(None),
    ).order_by(AbstractForm.version.desc()))

    if form is None or not form.schema:
        raise HTTPException(503, detail={"code": "ABSTRACT_FORM_UNAVAILABLE"})
    form_title = form.title
    form_schema = form.schema
    try:
        form_schema = abstract_schema_projection(form_schema, stored=True, event_id=event_id)
        from app.modules.registration.schemas.event_form_contracts import public_form_projection
        public_document = public_form_projection(form_schema.get("fields", []),
            form_schema.get("settings", {}), event_id=event_id)
        form_schema["fields"], form_schema["settings"] = public_document["fields"], public_document["settings"]
    except ValueError:
        raise HTTPException(503, detail={"code": "ABSTRACT_FORM_UNAVAILABLE"})
    theme = form_schema.get("settings", {}).get("theme")
    if isinstance(theme, dict) and theme.get("header_banner_asset_id"):
        asset_id = theme.pop("header_banner_asset_id")
        theme["header_banner_url"] = (
            f"/api/v1/public/events/{event.id}/form-assets/{asset_id}"
        )

    # Relational topics
    rel_topics = list((await db.scalars(
        select(AbstractTopic.name)
        .where(AbstractTopic.event_id == event_id, AbstractTopic.is_active.is_(True))
        .order_by(AbstractTopic.sort_order, AbstractTopic.name)
    )).all())
    topics = rel_topics if rel_topics else (call.topics or [])

    # Relational formats
    rel_formats = list((await db.scalars(
        select(AbstractFormat.code)
        .where(AbstractFormat.event_id == event_id, AbstractFormat.is_active.is_(True))
        .order_by(AbstractFormat.sort_order, AbstractFormat.code)
    )).all())
    abstract_types = rel_formats if rel_formats else (call.abstract_types or ["ORAL", "POSTER"])

    # Relational categories
    rel_cats = list((await db.scalars(
        select(AbstractCategory.name)
        .where(AbstractCategory.event_id == event_id, AbstractCategory.is_active.is_(True))
        .order_by(AbstractCategory.sort_order, AbstractCategory.name)
    )).all())

    # Relational portal settings
    portal = await db.scalar(select(AbstractPortalSettings).where(AbstractPortalSettings.event_id == event_id))
    portal_dict = {}
    if portal:
        portal_dict = {
            "submission_portal": {
                "access_mode": portal.sub_access_mode,
                "show_countdown_banner": portal.sub_show_countdown,
                "show_taxonomy_guide": portal.sub_show_taxonomy_guide,
                "guidelines_text": portal.sub_guidelines_text,
                "allow_author_edits": portal.sub_allow_edits,
                "allow_author_withdrawal": portal.sub_allow_withdrawal,
                "require_coauthor_verification": portal.sub_require_coauthor_verify,
                "feedback_release_policy": portal.sub_feedback_policy,
                "success_message": portal.sub_success_message,
                "support_email": portal.sub_support_email,
                "support_phone": portal.sub_support_phone,
            },
            "review_portal": {
                "redact_author_names": portal.rev_redact_author_names,
                "redact_affiliations": portal.rev_redact_affiliations,
                "redact_coauthors": portal.rev_redact_coauthors,
                "peer_visibility_mode": portal.rev_peer_visibility,
                "show_aggregate_scores": portal.rev_show_aggregate_scores,
                "allow_review_editing": portal.rev_allow_editing,
                "mandatory_comments_policy": portal.rev_mandatory_comments,
                "enforce_coi_declaration": portal.rev_enforce_coi,
                "auto_warn_institutional_conflict": portal.rev_auto_warn_institution,
                "in_browser_pdf_viewer": portal.rev_in_browser_pdf,
            }
        }
    elif isinstance(call.author_rules, dict) and "portal_settings" in call.author_rules:
        portal_dict = call.author_rules["portal_settings"]

    # Allowed extensions parsing
    allowed_exts = ["pdf", "docx"]
    if hasattr(call, "allowed_file_extensions") and call.allowed_file_extensions:
        if isinstance(call.allowed_file_extensions, list):
            allowed_exts = call.allowed_file_extensions
        elif isinstance(call.allowed_file_extensions, str):
            allowed_exts = [x.strip().lstrip(".") for x in call.allowed_file_extensions.split(",") if x.strip()]

    return PublicAbstractCallResponse(
        event_id=event.id,
        event_name=event.name,
        opens_at=call.opens_at,
        closes_at=call.closes_at,
        revision_deadline=call.revision_deadline,
        min_words=call.min_words,
        max_words=call.max_words,
        abstract_types=abstract_types,
        topics=topics,
        categories=rel_cats or (call.author_rules.get("categories") if isinstance(call.author_rules, dict) else []),
        allow_coauthors=getattr(call, "allow_coauthors", True),
        max_coauthors=getattr(call, "max_coauthors", 5),
        require_presenter=getattr(call, "require_presenter", True),
        require_affiliation=getattr(call, "require_affiliation", True),
        require_country=getattr(call, "require_country", True),
        require_attachments=getattr(call, "require_attachments", False),
        allowed_file_extensions=allowed_exts,
        max_file_size_mb=getattr(call, "max_file_size_mb", 25),
        require_disclosures=getattr(call, "require_disclosures", False),
        portal_settings=portal_dict,
        author_rules=call.author_rules or {},
        attachment_rules=call.attachment_rules or {},
        disclosure_rules=call.disclosure_rules or {},
        form_title=form_title,
        form_schema=form_schema,
    )


@public_router.post("/events/{event_id}/call-for-abstracts/submissions", response_model=PublicAbstractSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def public_submit_abstract(
    event_id: uuid.UUID,
    payload: PublicAbstractSubmissionCreate,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> PublicAbstractSubmissionResponse:
    """Public submission without requiring pre-issued invitation; generates author grant on success."""
    now = datetime.now(timezone.utc)
    event = await db.scalar(select(Event).where(Event.id == event_id, Event.deleted_at.is_(None)))
    if event is None:
        raise HTTPException(status_code=404, detail={"code": "EVENT_NOT_FOUND"})

    call = await db.scalar(select(AbstractCall).where(AbstractCall.event_id == event_id).with_for_update())
    if call is None or call.status != "OPEN" or (call.opens_at and call.opens_at > now) or (call.closes_at and call.closes_at < now):
        raise HTTPException(status_code=409, detail={"code": "ABSTRACT_CALL_CLOSED", "message": "The call for abstracts is not accepting submissions."})

    primary_author = next((a for a in payload.authors if a.is_presenter and a.email), None) or next((a for a in payload.authors if a.email), None) or payload.authors[0]
    author_email = str(primary_author.email or "").lower().strip()
    if not author_email:
        raise HTTPException(status_code=422, detail={"code": "AUTHOR_EMAIL_REQUIRED", "message": "At least one author must provide a valid email."})

    # Validate abstract type against call types and relational formats
    allowed_types = {str(value).upper() for value in (call.abstract_types or [])}
    rel_formats = list((await db.scalars(
        select(AbstractFormat.code)
        .where(AbstractFormat.event_id == event_id, AbstractFormat.is_active.is_(True))
    )).all())
    for rf in rel_formats:
        allowed_types.add(str(rf).upper())

    if allowed_types and payload.abstract_type.upper() not in allowed_types:
        raise HTTPException(status_code=422, detail={"code": "ABSTRACT_TYPE_NOT_AVAILABLE", "message": "The requested presentation type is not enabled for this call."})

    # Validate topic against call topics and relational topics
    allowed_topics = {str(value) for value in (call.topics or [])}
    rel_topics = list((await db.scalars(
        select(AbstractTopic.name)
        .where(AbstractTopic.event_id == event_id, AbstractTopic.is_active.is_(True))
    )).all())
    for rt in rel_topics:
        allowed_topics.add(str(rt))

    if allowed_topics and payload.topic and payload.topic not in allowed_topics:
        raise HTTPException(status_code=422, detail={"code": "ABSTRACT_TOPIC_NOT_AVAILABLE", "message": "The requested topic is not enabled for this call."})
    word_count = len(payload.body.split())
    if word_count < call.min_words or word_count > call.max_words:
        raise HTTPException(status_code=422, detail={"code": "ABSTRACT_WORD_COUNT_INVALID", "message": f"Abstract body must contain {call.min_words} to {call.max_words} words."})

    # Co-authors validation
    allow_co = call.allow_coauthors if hasattr(call, "allow_coauthors") and call.allow_coauthors is not None else True
    max_co = call.max_coauthors if hasattr(call, "max_coauthors") and call.max_coauthors is not None else 5
    co_authors = [a for a in payload.authors if str(a.email or "").lower().strip() != author_email]
    if not allow_co and co_authors:
        raise HTTPException(status_code=422, detail={"code": "COAUTHORS_NOT_ALLOWED", "message": "Co-authors are not permitted for this call."})
    if len(co_authors) > max_co:
        raise HTTPException(status_code=422, detail={"code": "COAUTHOR_LIMIT_EXCEEDED", "message": f"Maximum {max_co} co-author(s) allowed."})

    require_affil = call.require_affiliation if hasattr(call, "require_affiliation") and call.require_affiliation is not None else True
    if require_affil:
        for author in payload.authors:
            if not (author.affiliation and author.affiliation.strip()):
                raise HTTPException(status_code=422, detail={"code": "AUTHOR_AFFILIATION_REQUIRED", "message": f"Affiliation is required for author {author.full_name}."})

    require_cntry = call.require_country if hasattr(call, "require_country") and call.require_country is not None else True
    if require_cntry:
        for author in payload.authors:
            if not (author.country and author.country.strip()):
                raise HTTPException(status_code=422, detail={"code": "AUTHOR_COUNTRY_REQUIRED", "message": f"Country is required for author {author.full_name}."})

    await _validate_public_submission_form(db, event_id=event_id, call=call, form_payload=payload.form_payload)

    raw_token = secrets.token_urlsafe(32)
    grant = ProgrammeAccessGrant(
        organization_id=event.organization_id, event_id=event.id,
        audience="AUTHOR", email=author_email, token_hash=_hash_token(raw_token),
        resource_type="SUBMISSION",
        permissions={"edit": True, "upload": True, "withdraw": True},
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(grant)
    await db.flush()

    row = AbstractSubmission(
        organization_id=event.organization_id, event_id=event.id,
        code=f"ABS-{uuid.uuid4().hex[:8].upper()}", title=payload.title.strip(), body=payload.body.strip(),
        keywords=list(dict.fromkeys(value.strip() for value in payload.keywords if value.strip())),
        abstract_type=payload.abstract_type.upper(), topic=payload.topic, track=payload.track,
        form_payload=payload.form_payload,
        publication_payload={"author_confirmation": raw_token},
        status="SUBMITTED", submitted_at=now,
    )
    db.add(row)
    await db.flush()

    author_objs = []
    for index, author in enumerate(payload.authors):
        a_obj = AbstractAuthor(
            organization_id=event.organization_id, event_id=event.id, submission_id=row.id,
            full_name=author.full_name.strip(), email=str(author.email).lower() if author.email else None,
            affiliation=author.affiliation, country=author.country, is_presenter=author.is_presenter, display_order=index,
        )
        db.add(a_obj)
        author_objs.append(a_obj)

    grant.resource_id = row.id
    await db.commit()
    return _public_submission_response(row, authors=author_objs)


async def _published_schedule(event_id: uuid.UUID, db: AsyncSession, *, require_embed: bool = False) -> dict:
    publication = await db.scalar(select(ProgrammeSchedulePublication).join(Event, Event.id == ProgrammeSchedulePublication.event_id).where(
        ProgrammeSchedulePublication.organization_id == Event.organization_id,
        ProgrammeSchedulePublication.event_id == event_id,
        ProgrammeSchedulePublication.status == "PUBLISHED",
    ))
    if publication is None or (require_embed and not publication.embed_enabled) or (not require_embed and not publication.json_feed_enabled):
        raise HTTPException(status_code=404, detail={"code": "SCHEDULE_FEED_UNAVAILABLE", "message": "This schedule is not publicly available."})
    event = await db.scalar(select(Event).where(Event.id == event_id, Event.deleted_at.is_(None)))
    if event is None:
        raise HTTPException(status_code=404, detail={"code": "EVENT_NOT_FOUND"})
    rows = list((await db.execute(select(Session, Room, Track).outerjoin(Room, Room.id == Session.room_id).outerjoin(
        Track, Track.id == Session.track_id).where(Session.event_id == event_id, Session.deleted_at.is_(None),
        Session.is_published.is_(True)).order_by(Session.start_time, Session.id).limit(1000))).all())
    return {"event_id": event.id, "event_name": event.name, "published_at": publication.published_at,
            "sessions": [{"id": str(session.id), "code": session.session_code, "title": session.title,
                          "type": session.session_type, "description": session.description,
                          "starts_at": session.start_time, "ends_at": session.end_time,
                          "room": room.name if room else None, "track": track.name if track else None}
                         for session, room, track in rows]}


@public_router.get("/events/{event_id}/schedule.json")
async def public_schedule_json(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Deliberately small, cacheable public JSON feed; never exposes staff-only notes."""
    return await _published_schedule(event_id, db, require_embed=False)


@public_router.get("/events/{event_id}/schedule/embed")
async def public_schedule_embed(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Embed-safe schedule payload enabled independently from the general JSON feed."""
    return await _published_schedule(event_id, db, require_embed=True)


async def _author_grant(token: str, db: AsyncSession) -> ProgrammeAccessGrant:
    grant = await db.scalar(select(ProgrammeAccessGrant).where(ProgrammeAccessGrant.token_hash == _hash_token(token)).with_for_update())
    if grant is None or grant.audience != "AUTHOR" or grant.status != "ACTIVE" or grant.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail={"code": "AUTHOR_ACCESS_UNAVAILABLE", "message": "This author access link is unavailable."})
    return grant


def _public_submission_response(
    row: AbstractSubmission,
    decision: AbstractDecision | None = None,
    authors: list[AbstractAuthor] | None = None,
    attachments: list[Any] | None = None,
) -> PublicAbstractSubmissionResponse:
    return PublicAbstractSubmissionResponse(
        id=row.id, code=row.code, title=row.title, body=row.body, keywords=row.keywords or [], status=row.status, version=row.version,
        abstract_type=row.abstract_type, topic=row.topic, track=row.track, form_payload=row.form_payload or {},
        authors=[PublicAbstractAuthor(full_name=author.full_name, email=author.email, affiliation=author.affiliation, country=author.country, is_presenter=author.is_presenter) for author in (authors or [])],
        attachments=[{"id": str(attachment.id), "kind": attachment.kind, "filename": attachment.filename, "storage_path": attachment.storage_path, "mime_type": attachment.mime_type, "file_size_bytes": attachment.file_size_bytes} for attachment in (attachments or [])],
        submitted_at=row.submitted_at, decision=row.final_decision,
        notes_to_author=decision.notes_to_author if decision else None,
        author_confirmation=(row.publication_payload or {}).get("author_confirmation"),
    )


async def _validate_public_submission_form(
    db: AsyncSession, *, event_id: uuid.UUID, call: AbstractCall, form_payload: dict[str, object]
) -> None:
    """Validate required published-form and disclosure values at the public command boundary."""
    form = await db.scalar(select(AbstractForm).where(
        AbstractForm.event_id == event_id,
        AbstractForm.is_active.is_(True),
        AbstractForm.published_at.is_not(None),
    ).order_by(AbstractForm.version.desc()))
    fields = ((form.schema if form else {}) or {}).get("fields", [])
    if isinstance(fields, list):
        for field in fields:
            if not isinstance(field, dict) or not (field.get("required") or field.get("is_required")):
                continue
            key = str(field.get("key") or field.get("name") or "").strip()
            value = form_payload.get(key) if key else None
            if value is None or (isinstance(value, str) and not value.strip()) or (isinstance(value, list) and not value):
                raise HTTPException(status_code=422, detail={"code": "ABSTRACT_FORM_FIELD_REQUIRED", "field": key, "message": f"{field.get('label') or key} is required."})
    rules = call.disclosure_rules or {}
    required = rules.get("required_fields") or rules.get("required") or []
    if isinstance(required, dict):
        required = [key for key, enabled in required.items() if enabled]
    if isinstance(required, list):
        for key in required:
            value = form_payload.get(str(key))
            if value is None or (isinstance(value, str) and not value.strip()):
                raise HTTPException(status_code=422, detail={"code": "ABSTRACT_DISCLOSURE_REQUIRED", "field": str(key), "message": "Required disclosure information is missing."})


@public_router.get("/access/{token}/author/submissions", response_model=list[PublicAbstractSubmissionResponse])
async def list_author_submissions(token: str, db: AsyncSession = Depends(get_db)) -> list[PublicAbstractSubmissionResponse]:
    grant = await _author_grant(token, db)
    rows = list((await db.scalars(
        select(AbstractSubmission)
        .join(AbstractAuthor, AbstractAuthor.submission_id == AbstractSubmission.id)
        .where(AbstractSubmission.organization_id == grant.organization_id, AbstractSubmission.event_id == grant.event_id, AbstractAuthor.organization_id == grant.organization_id, AbstractAuthor.email.ilike(grant.email))
        .order_by(AbstractSubmission.updated_at.desc(), AbstractSubmission.id)
        .limit(100)
    )).unique().all())
    submission_ids = [row.id for row in rows]
    decisions = list((await db.scalars(select(AbstractDecision).where(AbstractDecision.organization_id == grant.organization_id, AbstractDecision.event_id == grant.event_id, AbstractDecision.submission_id.in_(submission_ids)))).all()) if rows else []
    authors = list((await db.scalars(select(AbstractAuthor).where(AbstractAuthor.organization_id == grant.organization_id, AbstractAuthor.event_id == grant.event_id, AbstractAuthor.submission_id.in_(submission_ids)).order_by(AbstractAuthor.submission_id, AbstractAuthor.display_order))).all()) if rows else []
    attachments = list((await db.scalars(select(AbstractAttachment).where(AbstractAttachment.organization_id == grant.organization_id, AbstractAttachment.event_id == grant.event_id, AbstractAttachment.submission_id.in_(submission_ids)).order_by(AbstractAttachment.submission_id, AbstractAttachment.created_at))).all()) if rows else []
    latest = {decision.submission_id: decision for decision in decisions}
    authors_by_submission: dict[uuid.UUID, list[AbstractAuthor]] = {}
    attachments_by_submission: dict[uuid.UUID, list[AbstractAttachment]] = {}
    for author in authors:
        authors_by_submission.setdefault(author.submission_id, []).append(author)
    for attachment in attachments:
        attachments_by_submission.setdefault(attachment.submission_id, []).append(attachment)
    return [_public_submission_response(row, latest.get(row.id), authors_by_submission.get(row.id), attachments_by_submission.get(row.id)) for row in rows]


@public_router.post("/access/{token}/author/submissions", response_model=PublicAbstractSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def submit_author_abstract(
    token: str,
    payload: PublicAbstractSubmissionCreate,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> PublicAbstractSubmissionResponse:
    """Submit once through an author grant; raw access tokens are never persisted."""
    grant = await _author_grant(token, db)
    now = datetime.now(timezone.utc)
    call = await db.scalar(select(AbstractCall).where(AbstractCall.event_id == grant.event_id).with_for_update())
    if call is None or call.status != "OPEN" or (call.opens_at and call.opens_at > now) or (call.closes_at and call.closes_at < now):
        raise HTTPException(status_code=409, detail={"code": "ABSTRACT_CALL_CLOSED", "message": "The call for abstracts is not accepting submissions."})
    emails = {str(author.email).lower() for author in payload.authors}
    if grant.email.lower() not in emails:
        raise HTTPException(status_code=422, detail={"code": "AUTHOR_ACCESS_MISMATCH", "message": "The access-link email must be included as an author."})
    if payload.abstract_type.upper() not in {str(value).upper() for value in (call.abstract_types or [])}:
        raise HTTPException(status_code=422, detail={"code": "ABSTRACT_TYPE_NOT_AVAILABLE", "message": "The requested presentation type is not enabled for this call."})
    if payload.topic and call.topics and payload.topic not in {str(value) for value in call.topics}:
        raise HTTPException(status_code=422, detail={"code": "ABSTRACT_TOPIC_NOT_AVAILABLE", "message": "The requested topic is not enabled for this call."})
    word_count = len(payload.body.split())
    if word_count < call.min_words or word_count > call.max_words:
        raise HTTPException(status_code=422, detail={"code": "ABSTRACT_WORD_COUNT_INVALID", "message": f"Abstract body must contain {call.min_words} to {call.max_words} words."})
    
    # Enforce configured author rules from setup console
    author_rules = call.author_rules or {}
    co_authors_allowed = str(author_rules.get("co_authors_allowed") or "").strip().lower()
    co_authors = [a for a in payload.authors if str(a.email).lower() != grant.email.lower()]
    if co_authors_allowed == "none" and co_authors:
        raise HTTPException(status_code=422, detail={"code": "COAUTHORS_NOT_ALLOWED", "message": "Co-authors are not permitted for this call."})
    elif co_authors_allowed.isdigit() and len(co_authors) > int(co_authors_allowed):
        raise HTTPException(status_code=422, detail={"code": "COAUTHOR_LIMIT_EXCEEDED", "message": f"Maximum {co_authors_allowed} co-author(s) allowed."})

    if author_rules.get("require_affiliation"):
        for author in payload.authors:
            if not (author.affiliation and author.affiliation.strip()):
                raise HTTPException(status_code=422, detail={"code": "AUTHOR_AFFILIATION_REQUIRED", "message": f"Affiliation is required for author {author.full_name}."})

    if author_rules.get("require_country"):
        for author in payload.authors:
            if not (author.country and author.country.strip()):
                raise HTTPException(status_code=422, detail={"code": "AUTHOR_COUNTRY_REQUIRED", "message": f"Country is required for author {author.full_name}."})

    await _validate_public_submission_form(db, event_id=grant.event_id, call=call, form_payload=payload.form_payload)
    key = idempotency_key or f"public-abstract:{grant.id}:{uuid.uuid4()}"
    try:
        idem = await begin_idempotent(
            db, organization_id=grant.organization_id, actor_id=None, operation=f"programme.author.{grant.id}.submit", key=key,
            payload=payload.model_dump(mode="json"),
        )
        replay = replay_response(idem)
        if replay:
            row = await db.get(AbstractSubmission, idem.resource_id)
            if row is None:
                raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESOURCE_MISSING", "message": "The prior submission is unavailable."})
            await db.commit()
            return _public_submission_response(row)
        row = AbstractSubmission(
            organization_id=grant.organization_id, event_id=grant.event_id,
            code=f"ABS-{uuid.uuid4().hex[:8].upper()}", title=payload.title.strip(), body=payload.body.strip(),
            keywords=list(dict.fromkeys(value.strip() for value in payload.keywords if value.strip())),
            abstract_type=payload.abstract_type.upper(), topic=payload.topic, track=payload.track,
            form_payload=payload.form_payload, status="SUBMITTED", submitted_at=now,
        )
        db.add(row)
        await db.flush()
        for index, author in enumerate(payload.authors):
            db.add(AbstractAuthor(
                organization_id=grant.organization_id, event_id=grant.event_id, submission_id=row.id,
                full_name=author.full_name.strip(), email=str(author.email).lower(), affiliation=author.affiliation,
                country=author.country, is_presenter=author.is_presenter, display_order=index,
            ))
        await complete_idempotent(db, idem, response_status=201, response_body={"resource_id": str(row.id)}, resource_id=row.id)
        grant.consumed_at = now
        await db.commit()
        return _public_submission_response(row, authors=[AbstractAuthor(full_name=author.full_name, email=str(author.email), affiliation=author.affiliation, country=author.country, is_presenter=author.is_presenter) for author in payload.authors])
    except Exception:
        await db.rollback()
        raise


@public_router.post("/access/{token}/author/submissions/{submission_id}/attachments", response_model=PublicAbstractSubmissionResponse)
async def add_author_attachment(
    token: str,
    submission_id: uuid.UUID,
    payload: PublicAbstractAttachmentCreate,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> PublicAbstractSubmissionResponse:
    """Record a provider-validated supporting file for an author-owned submission."""
    grant = await _author_grant(token, db)
    try:
        row = await db.scalar(select(AbstractSubmission).join(AbstractAuthor, AbstractAuthor.submission_id == AbstractSubmission.id).where(
            AbstractSubmission.id == submission_id, AbstractSubmission.organization_id == grant.organization_id, AbstractSubmission.event_id == grant.event_id,
            AbstractAuthor.organization_id == grant.organization_id, AbstractAuthor.event_id == grant.event_id, AbstractAuthor.email.ilike(grant.email),
        ).with_for_update())
        if row is None:
            raise HTTPException(status_code=404, detail={"code": "AUTHOR_SUBMISSION_NOT_FOUND"})
        if row.status in {"ACCEPTED", "REJECTED", "WITHDRAWN"}:
            raise HTTPException(status_code=409, detail={"code": "ABSTRACT_ATTACHMENT_CLOSED", "message": "Supporting files cannot be changed in this state."})
        key = idempotency_key or f"public-abstract-attachment:{grant.id}:{submission_id}:{payload.filename}"
        idem = await begin_idempotent(
            db, organization_id=grant.organization_id, actor_id=None, operation="programme.author.attachment.add", key=key,
            payload={"grant_id": str(grant.id), "submission_id": str(submission_id), **payload.model_dump(mode="json")},
        )
        replay = replay_response(idem)
        if replay:
            attachment = await db.get(AbstractAttachment, idem.resource_id)
            if attachment is None:
                raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESOURCE_MISSING"})
            await db.commit()
            authors = list((await db.scalars(select(AbstractAuthor).where(AbstractAuthor.submission_id == row.id).order_by(AbstractAuthor.display_order))).all())
            attachments = list((await db.scalars(select(AbstractAttachment).where(AbstractAttachment.submission_id == row.id).order_by(AbstractAttachment.created_at))).all())
            return _public_submission_response(row, authors=authors, attachments=attachments)
        attachment = AbstractAttachment(
            organization_id=grant.organization_id, event_id=grant.event_id, submission_id=row.id,
            kind=payload.kind.strip(), filename=payload.filename.strip(), storage_path=payload.storage_path.strip(),
            mime_type=payload.mime_type, file_size_bytes=payload.file_size_bytes,
        )
        db.add(attachment)
        row.version = int(row.version or 1) + 1
        await db.flush()
        await complete_idempotent(db, idem, response_status=200, response_body={"resource_id": str(attachment.id)}, resource_id=attachment.id)
        await db.commit()
        authors = list((await db.scalars(select(AbstractAuthor).where(AbstractAuthor.organization_id == grant.organization_id, AbstractAuthor.event_id == grant.event_id, AbstractAuthor.submission_id == row.id).order_by(AbstractAuthor.display_order))).all())
        attachments = list((await db.scalars(select(AbstractAttachment).where(AbstractAttachment.organization_id == grant.organization_id, AbstractAttachment.event_id == grant.event_id, AbstractAttachment.submission_id == row.id).order_by(AbstractAttachment.created_at))).all())
        return _public_submission_response(row, authors=authors, attachments=attachments)
    except Exception:
        await db.rollback()
        raise


@public_router.post("/access/{token}/author/submissions/{submission_id}/attachments/upload", response_model=PublicAbstractSubmissionResponse)
async def upload_author_attachment(
    token: str,
    submission_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> PublicAbstractSubmissionResponse:
    """Store a supporting file and its durable abstract attachment record."""
    grant = await _author_grant(token, db)
    row = await db.scalar(select(AbstractSubmission).join(AbstractAuthor, AbstractAuthor.submission_id == AbstractSubmission.id).where(
        AbstractSubmission.id == submission_id,
        AbstractSubmission.event_id == grant.event_id,
        AbstractAuthor.email.ilike(grant.email),
    ).with_for_update())
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "AUTHOR_SUBMISSION_NOT_FOUND"})
    if row.status in {"ACCEPTED", "REJECTED", "WITHDRAWN"}:
        raise HTTPException(status_code=409, detail={"code": "ABSTRACT_ATTACHMENT_CLOSED"})
    contents = await file.read()
    if not contents or len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail={"code": "ABSTRACT_ATTACHMENT_TOO_LARGE", "message": "Supporting files must be between 1 byte and 50 MB."})
    content_type = (file.content_type or "application/octet-stream").lower()
    allowed = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "application/zip"}
    if content_type not in allowed:
        raise HTTPException(status_code=422, detail={"code": "ABSTRACT_ATTACHMENT_TYPE_UNSUPPORTED"})
    safe_name = (file.filename or "supporting-file").replace("/", "_").replace("\\", "_")
    digest = hashlib.sha256(contents).hexdigest()
    key = idempotency_key or f"public-abstract-upload:{grant.id}:{submission_id}:{digest}"
    idem = await begin_idempotent(
        db, organization_id=grant.organization_id, actor_id=None,
        operation="programme.author.attachment.upload", key=key,
        payload={"grant_id": str(grant.id), "submission_id": str(submission_id), "filename": safe_name, "sha256": digest},
    )
    if replay_response(idem):
        await db.commit()
        authors = list((await db.scalars(select(AbstractAuthor).where(AbstractAuthor.submission_id == row.id).order_by(AbstractAuthor.display_order))).all())
        attachments = list((await db.scalars(select(AbstractAttachment).where(AbstractAttachment.submission_id == row.id).order_by(AbstractAttachment.created_at))).all())
        return _public_submission_response(row, authors=authors, attachments=attachments)
    storage_path = f"{grant.organization_id}/{grant.event_id}/abstracts/{row.id}/{digest[:16]}-{safe_name}"
    try:
        await asyncio.to_thread(
            upload_service.upload_bytes,
            bucket=settings.S3_BUCKET_ASSETS,
            storage_path=storage_path,
            data=contents,
            content_type=content_type,
        )
        attachment = AbstractAttachment(
            organization_id=grant.organization_id, event_id=grant.event_id, submission_id=row.id,
            kind="SUPPORTING_FILE", filename=safe_name, storage_path=storage_path,
            mime_type=content_type, file_size_bytes=len(contents),
        )
        db.add(attachment)
        row.version = int(row.version or 1) + 1
        await db.flush()
        await complete_idempotent(db, idem, response_status=200, response_body={"resource_id": str(attachment.id)}, resource_id=attachment.id)
        await db.commit()
        authors = list((await db.scalars(select(AbstractAuthor).where(AbstractAuthor.submission_id == row.id).order_by(AbstractAuthor.display_order))).all())
        attachments = list((await db.scalars(select(AbstractAttachment).where(AbstractAttachment.submission_id == row.id).order_by(AbstractAttachment.created_at))).all())
        return _public_submission_response(row, authors=authors, attachments=attachments)
    except Exception:
        await db.rollback()
        raise


@public_router.put("/access/{token}/author/submissions/{submission_id}", response_model=PublicAbstractSubmissionResponse)
async def revise_author_abstract(
    token: str, submission_id: uuid.UUID, payload: PublicAbstractSubmissionUpdate,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> PublicAbstractSubmissionResponse:
    """Author-only revision before the configured revision deadline."""
    grant = await _author_grant(token, db)
    now = datetime.now(timezone.utc)
    try:
        call = await db.scalar(select(AbstractCall).where(AbstractCall.event_id == grant.event_id).with_for_update())
        row = await db.scalar(select(AbstractSubmission).join(AbstractAuthor, AbstractAuthor.submission_id == AbstractSubmission.id).where(
            AbstractSubmission.id == submission_id, AbstractSubmission.event_id == grant.event_id,
            AbstractAuthor.email.ilike(grant.email),
        ).with_for_update())
        if row is None:
            raise HTTPException(status_code=404, detail={"code": "AUTHOR_SUBMISSION_NOT_FOUND"})
        if row.version != payload.expected_version:
            raise_version_conflict(current_version=row.version)
        deadline = call.revision_deadline if call else None
        if row.status not in {"DRAFT", "SUBMITTED", "REVISION_REQUESTED"} or (deadline and deadline < now):
            raise HTTPException(status_code=409, detail={"code": "ABSTRACT_REVISION_CLOSED", "message": "This abstract can no longer be revised."})
        count = len(payload.body.split())
        if call and not call.min_words <= count <= call.max_words:
            raise HTTPException(status_code=422, detail={"code": "ABSTRACT_WORD_COUNT_INVALID"})
        if call:
            await _validate_public_submission_form(db, event_id=grant.event_id, call=call, form_payload=payload.form_payload)
        row.title, row.body, row.keywords = payload.title.strip(), payload.body.strip(), list(dict.fromkeys(payload.keywords))
        row.abstract_type, row.topic, row.track, row.form_payload = payload.abstract_type.upper(), payload.topic, payload.track, payload.form_payload
        row.version += 1
        await db.execute(delete(AbstractAuthor).where(AbstractAuthor.submission_id == row.id))
        for index, author in enumerate(payload.authors):
            db.add(AbstractAuthor(organization_id=grant.organization_id, event_id=grant.event_id, submission_id=row.id,
                full_name=author.full_name.strip(), email=str(author.email).lower(), affiliation=author.affiliation,
                country=author.country, is_presenter=author.is_presenter, display_order=index))
        await db.commit()
        return _public_submission_response(row, authors=[AbstractAuthor(full_name=author.full_name, email=str(author.email), affiliation=author.affiliation, country=author.country, is_presenter=author.is_presenter) for author in payload.authors])
    except Exception:
        await db.rollback()
        raise


@public_router.post("/access/{token}/author/submissions/{submission_id}/withdraw", response_model=PublicAbstractSubmissionResponse)
async def withdraw_author_abstract(token: str, submission_id: uuid.UUID, expected_version: int = Header(..., alias="If-Match"),
                                   db: AsyncSession = Depends(get_db)) -> PublicAbstractSubmissionResponse:
    grant = await _author_grant(token, db)
    try:
        row = await db.scalar(select(AbstractSubmission).join(AbstractAuthor, AbstractAuthor.submission_id == AbstractSubmission.id).where(
            AbstractSubmission.id == submission_id, AbstractSubmission.event_id == grant.event_id, AbstractAuthor.email.ilike(grant.email),
        ).with_for_update())
        if row is None:
            raise HTTPException(status_code=404, detail={"code": "AUTHOR_SUBMISSION_NOT_FOUND"})
        if row.version != expected_version:
            raise_version_conflict(current_version=row.version)
        if row.status in {"ACCEPTED", "REJECTED", "WITHDRAWN"}:
            raise HTTPException(status_code=409, detail={"code": "ABSTRACT_WITHDRAW_UNAVAILABLE"})
        row.status, row.version = "WITHDRAWN", row.version + 1
        await db.commit()
        authors = list((await db.scalars(select(AbstractAuthor).where(AbstractAuthor.submission_id == row.id).order_by(AbstractAuthor.display_order))).all())
        attachments = list((await db.scalars(select(AbstractAttachment).where(AbstractAttachment.submission_id == row.id).order_by(AbstractAttachment.created_at))).all())
        return _public_submission_response(row, authors=authors, attachments=attachments)
    except Exception:
        await db.rollback()
        raise


@public_router.post("/access/{token}/author/submissions/{submission_id}/confirm", response_model=PublicAbstractSubmissionResponse)
async def confirm_author_abstract(
    token: str,
    submission_id: uuid.UUID,
    expected_version: int = Header(..., alias="If-Match"),
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> PublicAbstractSubmissionResponse:
    """Allow the submitting author to confirm an accepted programme place."""
    grant = await _author_grant(token, db)
    try:
        row = await db.scalar(select(AbstractSubmission).join(AbstractAuthor, AbstractAuthor.submission_id == AbstractSubmission.id).where(
            AbstractSubmission.id == submission_id, AbstractSubmission.event_id == grant.event_id,
            AbstractAuthor.email.ilike(grant.email),
        ).with_for_update())
        if row is None:
            raise HTTPException(status_code=404, detail={"code": "AUTHOR_SUBMISSION_NOT_FOUND"})
        if row.version != expected_version:
            raise_version_conflict(current_version=row.version)
        if row.status != "ACCEPTED":
            raise HTTPException(status_code=409, detail={"code": "ABSTRACT_CONFIRMATION_UNAVAILABLE", "message": "Only accepted abstracts can be confirmed."})
        key = idempotency_key or f"programme-author-confirm:{grant.id}:{submission_id}:{expected_version}"
        idem = await begin_idempotent(
            db, organization_id=grant.organization_id, actor_id=None,
            operation="programme.author_submission.confirm", key=key,
            payload={"grant_id": str(grant.id), "submission_id": str(submission_id), "expected_version": expected_version},
        )
        if replay_response(idem):
            await db.commit()
            return _public_submission_response(row)
        row.publication_payload = {**(row.publication_payload or {}), "author_confirmation": "CONFIRMED", "author_confirmed_at": datetime.now(timezone.utc).isoformat()}
        row.version += 1
        await complete_idempotent(db, idem, response_status=200, response_body={"resource_id": str(row.id), "version": row.version}, resource_id=row.id)
        await db.commit()
        authors = list((await db.scalars(select(AbstractAuthor).where(AbstractAuthor.submission_id == row.id).order_by(AbstractAuthor.display_order))).all())
        attachments = list((await db.scalars(select(AbstractAttachment).where(AbstractAttachment.submission_id == row.id).order_by(AbstractAttachment.created_at))).all())
        return _public_submission_response(row, authors=authors, attachments=attachments)
    except Exception:
        await db.rollback()
        raise


async def _reviewer_grant(token: str, db: AsyncSession, *, assignment_id: uuid.UUID | None = None) -> tuple[ProgrammeAccessGrant, AbstractReviewer]:
    grant = await db.scalar(select(ProgrammeAccessGrant).where(
        ProgrammeAccessGrant.token_hash == _hash_token(token)
    ).with_for_update())
    if grant is None or grant.audience != "REVIEWER" or grant.status != "ACTIVE" or grant.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail={"code": "REVIEWER_ACCESS_UNAVAILABLE"})
    # The persisted, authenticated grant proves this selector. Apply it only
    # transaction-locally; request rollback/commit clears the database setting.
    from app.core.tenant_context import TenantContextGuard
    await TenantContextGuard.apply(db, grant.organization_id)
    from app.modules.programme.rubric_integrity import lock_scoring_event
    await lock_scoring_event(db, organization_id=grant.organization_id, event_id=grant.event_id)
    if assignment_id is not None:
        # Match internal review order: event, submission, reviewer, assignment.
        # Reviewer-first locking can deadlock plan application or a review
        # command already holding the parent submission.
        submission_id = await db.scalar(select(AbstractAssignment.submission_id).join(
            AbstractReviewer, AbstractReviewer.id == AbstractAssignment.reviewer_id).where(
                AbstractAssignment.id == assignment_id, AbstractAssignment.organization_id == grant.organization_id,
                AbstractAssignment.event_id == grant.event_id, AbstractReviewer.organization_id == grant.organization_id,
                AbstractReviewer.event_id == grant.event_id, AbstractReviewer.email.ilike(grant.email)))
        if submission_id is None or await db.scalar(select(AbstractSubmission.id).where(
                AbstractSubmission.id == submission_id, AbstractSubmission.organization_id == grant.organization_id,
                AbstractSubmission.event_id == grant.event_id).with_for_update(of=AbstractSubmission)) is None:
            raise HTTPException(404, detail={"code": "REVIEW_ASSIGNMENT_NOT_FOUND"})
    reviewer = await db.scalar(select(AbstractReviewer).where(
        AbstractReviewer.organization_id == grant.organization_id, AbstractReviewer.event_id == grant.event_id, AbstractReviewer.email.ilike(grant.email)
    ).with_for_update())
    if reviewer is None or reviewer.status not in {"INVITED", "ACTIVE"}:
        raise HTTPException(status_code=404, detail={"code": "REVIEWER_ACCESS_UNAVAILABLE"})
    return grant, reviewer


@public_router.get("/access/{token}/reviewer/assignments", response_model=list[PublicReviewerAssignment])
async def reviewer_assignments(token: str, response: Response, db: AsyncSession = Depends(get_db)) -> list[PublicReviewerAssignment]:
    response.headers["Cache-Control"] = "no-store"
    grant, reviewer = await _reviewer_grant(token, db)
    call = await db.scalar(select(AbstractCall).where(AbstractCall.event_id == grant.event_id))
    rows = list((await db.execute(select(AbstractAssignment, AbstractSubmission).join(
        AbstractSubmission, AbstractSubmission.id == AbstractAssignment.submission_id
    ).where(AbstractAssignment.organization_id == grant.organization_id, AbstractAssignment.event_id == grant.event_id, AbstractAssignment.reviewer_id == reviewer.id,
    AbstractSubmission.organization_id == grant.organization_id)
    .order_by(AbstractAssignment.due_at, AbstractAssignment.assigned_at).limit(200))).all())
    anonymous = bool(call and call.blind_review_enabled)

    plan = await db.scalar(
        select(ProgrammeEvaluationPlan).where(
            ProgrammeEvaluationPlan.event_id == grant.event_id,
            ProgrammeEvaluationPlan.organization_id == grant.organization_id,
            ProgrammeEvaluationPlan.source_type == "ABSTRACT",
            ProgrammeEvaluationPlan.status == "ACTIVE",
    ).order_by(ProgrammeEvaluationPlan.created_at.desc(), ProgrammeEvaluationPlan.id).limit(1)
    )
    from app.modules.programme.rubric_integrity import validated_plan_rubric
    try:
        rubric = await validated_plan_rubric(db, plan)
    except HTTPException:
        raise HTTPException(503, detail={"code": "EVALUATION_RUBRIC_UNAVAILABLE"}, headers={"Cache-Control": "no-store"}) from None

    assignment_ids = [assignment.id for assignment, _ in rows]
    reviews = list((await db.scalars(select(AbstractReview).where(
        AbstractReview.assignment_id.in_(assignment_ids)
    ))).all()) if assignment_ids else []
    review_by_assignment = {rev.assignment_id: rev for rev in reviews}

    sub_ids = [submission.id for _, submission in rows]
    attachments = list((await db.scalars(select(AbstractAttachment).where(
        AbstractAttachment.submission_id.in_(sub_ids)
    ))).all()) if sub_ids else []
    attachments_by_sub: dict[uuid.UUID, list[dict]] = {}
    for att in attachments:
        attachments_by_sub.setdefault(att.submission_id, []).append({
            "id": str(att.id), "kind": att.kind, "filename": att.filename,
            "storage_path": att.storage_path, "mime_type": att.mime_type, "file_size_bytes": att.file_size_bytes,
        })

    authors_by_sub: dict[uuid.UUID, list[PublicAbstractAuthor]] = {}
    if not anonymous and sub_ids:
        authors = list((await db.scalars(select(AbstractAuthor).where(
            AbstractAuthor.submission_id.in_(sub_ids)
        ).order_by(AbstractAuthor.submission_id, AbstractAuthor.display_order))).all())
        for author in authors:
            authors_by_sub.setdefault(author.submission_id, []).append(
                PublicAbstractAuthor(full_name=author.full_name, email=author.email, affiliation=author.affiliation, country=author.country, is_presenter=author.is_presenter)
            )

    result = []
    for assignment, submission in rows:
        rev = review_by_assignment.get(assignment.id)
        result.append(PublicReviewerAssignment(
            id=assignment.id,
            submission_id=submission.id,
            submission_version=submission.version,
            code=submission.code,
            title="Anonymous submission" if anonymous else submission.title,
            body=submission.body,
            abstract_type=submission.abstract_type,
            topic=None if anonymous else submission.topic,
            status=assignment.status,
            due_at=assignment.due_at,
            conflict_declared=assignment.conflict_declared,
            anonymous=anonymous,
            rubric=rubric,
            authors=authors_by_sub.get(submission.id, []),
            attachments=attachments_by_sub.get(submission.id, []),
            recommendation=rev.recommendation if rev else None,
            total_score=rev.total_score if rev else None,
            scores=rev.scores if rev else {},
            comments_to_committee=rev.comments_to_committee if rev else None,
            comments_to_author=rev.comments_to_author if rev else None,
        ))
    return result


@public_router.put("/access/{token}/reviewer/assignments/{assignment_id}/conflict",
                   response_model=PublicReviewerConflictResult)
async def declare_reviewer_conflict(token: str, assignment_id: uuid.UUID, payload: PublicReviewerConflict,
                                    if_match: str = Header(..., alias="If-Match"),
                                    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
                                    db: AsyncSession = Depends(get_db)) -> dict[str, str | bool | int | None]:
    grant, reviewer = await _reviewer_grant(token, db, assignment_id=assignment_id)
    from app.core.tenant_context import TenantContextGuard
    async with TenantContextGuard.scoped(db, grant.organization_id):
        return await _declare_scoped_reviewer_conflict(
            grant, reviewer, assignment_id, payload, if_match, idempotency_key, db)


async def _declare_scoped_reviewer_conflict(grant, reviewer, assignment_id, payload, if_match, idempotency_key, db):
    from app.core.tenant_context import TenantContextGuard
    if TenantContextGuard.current() != grant.organization_id:
        raise RuntimeError("Public conflict update requires its verified grant context")
    expected = require_if_match(if_match)
    try:
        idem = await begin_idempotent(
            db, organization_id=grant.organization_id, actor_id=reviewer.user_id,
            operation="abstract.public_review.conflict", key=idempotency_key,
            payload={"assignment_id": str(assignment_id), "expected_version": expected,
                **payload.model_dump(mode="json")},
        )
        replay = replay_response(idem)
        if replay:
            await db.commit()
            return replay[1]
        assignment = await db.scalar(select(AbstractAssignment).where(
            AbstractAssignment.id == assignment_id,
            AbstractAssignment.organization_id == grant.organization_id,
            AbstractAssignment.event_id == grant.event_id,
            AbstractAssignment.reviewer_id == reviewer.id,
        ).with_for_update())
        if assignment is None:
            raise HTTPException(status_code=404, detail={"code": "REVIEW_ASSIGNMENT_NOT_FOUND"})
        submission = await db.scalar(select(AbstractSubmission).where(
            AbstractSubmission.id == assignment.submission_id,
            AbstractSubmission.organization_id == grant.organization_id,
            AbstractSubmission.event_id == grant.event_id,
        ).with_for_update())
        if submission is None:
            raise HTTPException(status_code=404, detail={"code": "REVIEW_ASSIGNMENT_NOT_FOUND"})
        if int(submission.version or 1) != expected:
            raise HTTPException(status_code=412, detail={
                "code": "RESOURCE_VERSION_CONFLICT", "current_version": submission.version})
        if assignment.status == "COMPLETED":
            raise HTTPException(status_code=409, detail={"code": "ABSTRACT_REVIEW_ALREADY_SUBMITTED"})

        response_body = {"status": assignment.status,
            "conflict_declared": assignment.conflict_declared,
            "submission_version": submission.version}
        target_status = "CONFLICT" if payload.conflict_declared else "ASSIGNED"
        changed = (assignment.conflict_declared != payload.conflict_declared or
            assignment.conflict_reason != payload.conflict_reason or
            assignment.status != target_status)
        if changed:
            old = {"status": assignment.status, "conflict_declared": assignment.conflict_declared}
            assignment.conflict_declared = payload.conflict_declared
            assignment.conflict_reason = payload.conflict_reason
            assignment.status = target_status
            submission.version = int(submission.version or 1) + 1
            from app.modules.audit.models.audit_log import AuditLog
            workspace_id = await db.scalar(select(Event.operational_workspace_id).where(
                Event.id == grant.event_id, Event.organization_id == grant.organization_id))
            db.add(AuditLog(organization_id=grant.organization_id, actor_user_id=reviewer.user_id,
                actor_role="PROGRAMME_REVIEWER", resource_type="abstract_assignment", resource_id=assignment.id,
                action_type="ABSTRACT_PUBLIC_REVIEW_CONFLICT_UPDATED", correlation_id=idem.id, is_sensitive=True,
                old_state=old, new_state={
                    "actor_grant_id": str(grant.id), "actor_reviewer_id": str(reviewer.id),
                    "acting_organization_id": str(grant.organization_id),
                    "target_organization_id": str(grant.organization_id),
                    "event_id": str(grant.event_id), "workspace_id": str(workspace_id),
                    "access_mode": "PUBLIC_GRANT", "submission_id": str(submission.id),
                    "assignment_id": str(assignment.id), "status": assignment.status,
                    "conflict_declared": assignment.conflict_declared,
                    "reason": "Reviewer updated conflict recusal"}))
            response_body = {"status": assignment.status,
                "conflict_declared": assignment.conflict_declared,
                "submission_version": submission.version}
        await complete_idempotent(db, idem, response_status=200,
            response_body=response_body, resource_id=assignment.id)
        await db.commit()
        return response_body
    except Exception:
        await db.rollback()
        raise


@public_router.post("/access/{token}/reviewer/assignments/{assignment_id}/review")
async def submit_public_review(token: str, assignment_id: uuid.UUID, payload: PublicReviewerReview,
                               idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
                               db: AsyncSession = Depends(get_db)) -> dict[str, str | int]:
    grant, reviewer = await _reviewer_grant(token, db, assignment_id=assignment_id)
    from app.core.tenant_context import TenantContextGuard
    # Retain verified context through idempotency's nested transaction, not
    # only its first SQL statement. Never depend on a browser tenant selector.
    async with TenantContextGuard.scoped(db, grant.organization_id):
        return await _submit_scoped_public_review(grant, reviewer, assignment_id, payload, idempotency_key, db)


async def _submit_scoped_public_review(grant, reviewer, assignment_id, payload, idempotency_key, db):
    from app.core.tenant_context import TenantContextGuard
    if TenantContextGuard.current() != grant.organization_id:
        raise RuntimeError("Public review requires its verified grant context")
    key = idempotency_key
    idem = await begin_idempotent(
        db, organization_id=grant.organization_id, actor_id=reviewer.user_id,
        operation="abstract.public_review.submit", key=key,
        payload={"assignment_id": str(assignment_id), **payload.model_dump()},
    )
    replay = replay_response(idem)
    if replay:
        await db.commit()
        return replay[1]
    assignment = await db.scalar(select(AbstractAssignment).where(
        AbstractAssignment.id == assignment_id, AbstractAssignment.organization_id == grant.organization_id, AbstractAssignment.event_id == grant.event_id,
        AbstractAssignment.reviewer_id == reviewer.id,
    ).with_for_update())
    if assignment is None:
        raise HTTPException(status_code=404, detail={"code": "REVIEW_ASSIGNMENT_NOT_FOUND"})
    if assignment.conflict_declared:
        raise HTTPException(status_code=409, detail={"code": "ABSTRACT_REVIEW_CONFLICT_DECLARED"})
    if assignment.due_at and assignment.due_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail={"code": "ABSTRACT_REVIEW_DEADLINE_PASSED", "message": "This review deadline has passed."})
    plan = await db.scalar(select(ProgrammeEvaluationPlan).where(
        ProgrammeEvaluationPlan.event_id == grant.event_id,
        ProgrammeEvaluationPlan.organization_id == grant.organization_id,
        ProgrammeEvaluationPlan.source_type == "ABSTRACT",
        ProgrammeEvaluationPlan.status == "ACTIVE",
    ).order_by(ProgrammeEvaluationPlan.created_at.desc(), ProgrammeEvaluationPlan.id).limit(1))
    # The assignment grants this reviewer access; the plan's reviewer pool is
    # not permission to bypass the scoring contract displayed by the portal.
    from app.modules.programme.rubric_integrity import validated_plan_rubric
    rubric = await validated_plan_rubric(db, plan)
    from app.modules.programme.rubric_integrity import validate_review_scores
    total = validate_review_scores(rubric, payload.scores)
    existing = await db.scalar(select(AbstractReview).where(AbstractReview.organization_id == grant.organization_id, AbstractReview.event_id == grant.event_id, AbstractReview.assignment_id == assignment.id))
    if existing:
        raise HTTPException(409, detail={"code": "ABSTRACT_REVIEW_ALREADY_SUBMITTED"})
    submission = await db.scalar(select(AbstractSubmission).where(AbstractSubmission.id == assignment.submission_id, AbstractSubmission.organization_id == grant.organization_id, AbstractSubmission.event_id == grant.event_id).with_for_update())
    review = AbstractReview(organization_id=grant.organization_id, event_id=grant.event_id, submission_id=submission.id,
        assignment_id=assignment.id, reviewer_id=reviewer.id, scores=payload.scores, total_score=total,
        recommendation=payload.recommendation, comments_to_committee=payload.comments_to_committee,
        comments_to_author=payload.comments_to_author)
    db.add(review)
    previous_status = assignment.status
    assignment.status, submission.version = "COMPLETED", submission.version + 1
    # Allocate the persisted identifier before constructing its replay receipt.
    await db.flush()
    from app.modules.audit.models.audit_log import AuditLog
    workspace_id = await db.scalar(select(Event.operational_workspace_id).where(
        Event.id == grant.event_id, Event.organization_id == grant.organization_id))
    db.add(AuditLog(organization_id=grant.organization_id, actor_user_id=reviewer.user_id,
        actor_role="PROGRAMME_REVIEWER", resource_type="abstract_review", resource_id=review.id,
        action_type="ABSTRACT_PUBLIC_REVIEW_SUBMITTED", correlation_id=idem.id, is_sensitive=True,
        old_state={"assignment_status": previous_status}, new_state={
            "actor_grant_id": str(grant.id), "actor_reviewer_id": str(reviewer.id),
            "acting_organization_id": str(grant.organization_id), "target_organization_id": str(grant.organization_id),
            "event_id": str(grant.event_id), "workspace_id": str(workspace_id), "access_mode": "PUBLIC_GRANT",
            "submission_id": str(submission.id), "assignment_id": str(assignment.id),
            "score_field_count": len(payload.scores), "reason": "Reviewer submitted assigned abstract review"}))
    await complete_idempotent(
        db, idem, response_status=200,
        response_body={"status": "COMPLETED", "review_id": str(review.id), "total_score": total},
        resource_id=review.id,
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": "ABSTRACT_REVIEW_ALREADY_SUBMITTED"}) from exc
    return {"status": "COMPLETED", "review_id": str(review.id), "total_score": total}
