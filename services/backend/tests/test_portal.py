# =============================================================
# Conference Platform — Portal Tests
# backend/tests/test_portal.py
# =============================================================

from __future__ import annotations

import uuid
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.speaker import Speaker
from app.modules.speakers.routers.portal import speaker_portal_auth, download_speaker_qr
from tests.conftest import activate_event_for_test


async def test_speaker_portal_auth_by_code(
    db: AsyncSession,
    speaker: Speaker,
):
    # Enable speaker portal mode for test
    speaker.event.speaker_mode_enabled = True
    db.add(speaker.event)
    await activate_event_for_test(db, speaker.event)
    await db.commit()

    # Authenticate via access code directly
    res = await speaker_portal_auth(event_id=speaker.event_id, token_or_code=speaker.speaker_code, db=db)
    
    # Assert return fields
    assert res.speaker_id == speaker.id
    assert res.first_name == speaker.first_name
    assert res.speaker_code == speaker.speaker_code
    assert res.qr_code_url == speaker.qr_code_url


async def test_download_speaker_qr_jpg(
    db: AsyncSession,
    speaker: Speaker,
):
    # Enable speaker portal mode for test
    speaker.event.speaker_mode_enabled = True
    db.add(speaker.event)
    await db.commit()

    # Call direct function for JPG format
    response = await download_speaker_qr(speaker_id=speaker.id, format="jpg", db=db)
    assert response is not None
    assert response.media_type == "image/jpeg"
    assert "attachment" in response.headers["content-disposition"]
    assert response.headers["content-disposition"].endswith('.jpg"')


async def test_download_speaker_qr_pdf(
    db: AsyncSession,
    speaker: Speaker,
):
    # Enable speaker portal mode for test
    speaker.event.speaker_mode_enabled = True
    db.add(speaker.event)
    await db.commit()

    # Call direct function for PDF format
    response = await download_speaker_qr(speaker_id=speaker.id, format="pdf", db=db)
    assert response is not None
    assert response.media_type == "application/pdf"
    assert "attachment" in response.headers["content-disposition"]
    assert response.headers["content-disposition"].endswith('.pdf"')


async def test_download_speaker_qr_not_found(
    db: AsyncSession,
):
    random_id = uuid.uuid4()
    with pytest.raises(HTTPException) as exc_info:
        await download_speaker_qr(speaker_id=random_id, format="jpg", db=db)
    assert exc_info.value.status_code == 404
