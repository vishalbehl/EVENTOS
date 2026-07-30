from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import CurrentEvent, get_db, get_current_user
from app.modules.presentations.models.presentation_bundle import BundleFile, ChainMode, PresentationBundle
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.events.models.session_speaker import SessionSpeaker
from app.modules.identity.models.user import User
from app.modules.presentations.schemas.bundle import BundleCreate, BundleResponse
from app.core.dependencies.feature_gate import require_event_operation

router = APIRouter(
    prefix="/events/{event_id}/bundles",
    tags=["bundles"],
    dependencies=[require_event_operation("presentations.queue.manage")],
)


@router.post("", response_model=BundleResponse, status_code=status.HTTP_201_CREATED)
async def create_bundle(
    payload: BundleCreate,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BundleResponse:
    if current_user.role not in ("super_admin", "organiser", "session_manager", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed.")

    ss = await _get_session_speaker_or_404(db, payload.session_speaker_id, event.id)
    files_by_id = await _load_files(db, [item.file_id for item in payload.files], event.id)
    missing = {item.file_id for item in payload.files} - set(files_by_id)
    if missing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bundle file not found.")

    wrong_slot = [
        str(file_id)
        for file_id, file in files_by_id.items()
        if file.session_speaker_id != payload.session_speaker_id
    ]
    if wrong_slot:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All bundle files must belong to the same session speaker slot.",
        )

    bundle = PresentationBundle(
        event_id=event.id,
        session_speaker_id=ss.id,
        name=payload.name,
        chain_mode=ChainMode(payload.chain_mode),
    )
    db.add(bundle)
    await db.flush()

    has_primary = any(item.is_primary for item in payload.files)
    for index, item in enumerate(sorted(payload.files, key=lambda i: i.deck_order)):
        db.add(
            BundleFile(
                bundle_id=bundle.id,
                file_id=item.file_id,
                deck_order=item.deck_order,
                is_primary=item.is_primary or (not has_primary and index == 0),
            )
        )

    ss.presentation_bundle_id = bundle.id
    await db.commit()
    return await _get_bundle_response(db, bundle.id, event.id)


@router.get("/{bundle_id}", response_model=BundleResponse)
async def get_bundle(
    bundle_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> BundleResponse:
    return await _get_bundle_response(db, bundle_id, event.id)


@router.get("", response_model=List[BundleResponse])
async def list_bundles(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> List[BundleResponse]:
    result = await db.execute(
        select(PresentationBundle)
        .options(selectinload(PresentationBundle.files))
        .where(PresentationBundle.event_id == event.id)
        .order_by(PresentationBundle.created_at.desc())
    )
    return [BundleResponse.model_validate(bundle) for bundle in result.scalars().all()]


async def _get_session_speaker_or_404(
    db: AsyncSession, session_speaker_id: uuid.UUID, event_id: uuid.UUID
) -> SessionSpeaker:
    result = await db.execute(
        select(SessionSpeaker)
        .join(SessionSpeaker.session)
        .where(SessionSpeaker.id == session_speaker_id)
        .where(SessionSpeaker.session.has(event_id=event_id))
    )
    ss = result.scalar_one_or_none()
    if ss is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session speaker not found.")
    return ss


async def _load_files(
    db: AsyncSession, file_ids: list[uuid.UUID], event_id: uuid.UUID
) -> dict[uuid.UUID, PresentationFile]:
    result = await db.execute(
        select(PresentationFile).where(
            PresentationFile.id.in_(file_ids),
            PresentationFile.event_id == event_id,
        )
    )
    return {file.id: file for file in result.scalars().all()}


async def _get_bundle_response(
    db: AsyncSession, bundle_id: uuid.UUID, event_id: uuid.UUID
) -> BundleResponse:
    result = await db.execute(
        select(PresentationBundle)
        .options(selectinload(PresentationBundle.files))
        .where(PresentationBundle.id == bundle_id, PresentationBundle.event_id == event_id)
    )
    bundle = result.scalar_one_or_none()
    if bundle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bundle not found.")
    return BundleResponse.model_validate(bundle)
