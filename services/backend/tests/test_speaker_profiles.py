# tests/test_speaker_profiles.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.speakers.models.speaker import Speaker
from app.modules.speakers.models.speaker_profile import SpeakerProfile
from app.modules.speakers.schemas.speaker_profile import SpeakerProfileResponse


def make_dummy_profile_dict(
    bio: str | None = None,
    extended_bio: str | None = None,
    profile_photo_url: str | None = None,
    cv_url: str | None = None,
    designation: str | None = None,
    organisation_name: str | None = None,
    website_url: str | None = None,
    linkedin_url: str | None = None,
    twitter_url: str | None = None,
    research_interests: list[str] | None = None,
) -> dict:
    return {
        "id": uuid.uuid4(),
        "speaker_id": uuid.uuid4(),
        "event_id": uuid.uuid4(),
        "organization_id": uuid.uuid4(),
        "bio": bio,
        "extended_bio": extended_bio,
        "profile_photo_url": profile_photo_url,
        "cv_url": cv_url,
        "designation": designation,
        "organisation_name": organisation_name,
        "department": None,
        "city": None,
        "country": None,
        "website_url": website_url,
        "linkedin_url": linkedin_url,
        "twitter_url": twitter_url,
        "research_interests": research_interests or [],
        "languages_spoken": [],
        "photo_consent": False,
        "last_updated_by": "organiser",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }


def test_profile_completeness_zero():
    # 0% completeness on empty structures
    data = make_dummy_profile_dict()
    resp = SpeakerProfileResponse.model_validate(data)
    assert resp.profile_completeness == 0


def test_profile_completeness_partial():
    # Test individual components and partial weights

    # 1. Photo only: +20%
    data = make_dummy_profile_dict(profile_photo_url="https://example.com/photo.jpg")
    resp = SpeakerProfileResponse.model_validate(data)
    assert resp.profile_completeness == 20

    # 2. Bio > 20 words: +25%
    words_21 = " ".join(["word"] * 21)
    data = make_dummy_profile_dict(bio=words_21)
    resp = SpeakerProfileResponse.model_validate(data)
    assert resp.profile_completeness == 25

    # 3. Bio <= 20 words: should be 0%
    words_20 = " ".join(["word"] * 20)
    data = make_dummy_profile_dict(bio=words_20)
    resp = SpeakerProfileResponse.model_validate(data)
    assert resp.profile_completeness == 0

    # 4. Designation and Organisation: +15%
    data = make_dummy_profile_dict(designation="Dr.", organisation_name="EventOS")
    resp = SpeakerProfileResponse.model_validate(data)
    assert resp.profile_completeness == 15

    # 5. Designation or Organisation missing: should be 0%
    data = make_dummy_profile_dict(designation="Dr.")
    resp = SpeakerProfileResponse.model_validate(data)
    assert resp.profile_completeness == 0

    # 6. Social URLs: +10%
    data = make_dummy_profile_dict(website_url="https://site.com")
    resp = SpeakerProfileResponse.model_validate(data)
    assert resp.profile_completeness == 10

    # 7. Extended Bio > 50 words: +20%
    words_51 = " ".join(["word"] * 51)
    data = make_dummy_profile_dict(extended_bio=words_51)
    resp = SpeakerProfileResponse.model_validate(data)
    assert resp.profile_completeness == 20

    # 8. Research interests >= 2 items: +10%
    data = make_dummy_profile_dict(research_interests=["AI", "Blockchain"])
    resp = SpeakerProfileResponse.model_validate(data)
    assert resp.profile_completeness == 10


def test_profile_completeness_full():
    # 100% completeness when all criteria met
    words_25 = " ".join(["word"] * 25)
    words_60 = " ".join(["word"] * 60)
    data = make_dummy_profile_dict(
        profile_photo_url="https://example.com/photo.jpg",
        bio=words_25,
        designation="Dr.",
        organisation_name="EventOS",
        website_url="https://site.com",
        extended_bio=words_60,
        research_interests=["AI", "Blockchain"],
    )
    resp = SpeakerProfileResponse.model_validate(data)
    assert resp.profile_completeness == 100


@pytest.mark.asyncio
async def test_speaker_profile_crud_endpoints(
    client: AsyncClient,
    db: AsyncSession,
    speaker: Speaker,
):
    # Enable speaker portal
    speaker.event.speaker_mode_enabled = True
    db.add(speaker.event)
    await db.commit()

    event_id = speaker.event_id
    speaker_id = speaker.id

    # 1. Profile initially doesn't exist (GET returns 404)
    resp = await client.get(
        f"/api/v1/events/{event_id}/speakers/{speaker_id}/profile",
        params={"token": speaker.upload_token}
    )
    assert resp.status_code == 404

    # 2. Upsert profile (PUT)
    profile_data = {
        "designation": "Prof.",
        "title": "Lead Scientist",
        "organisation_name": "AI Institute",
        "bio": "A short description with enough words to satisfy word limit and test completeness.",
        "website_url": "https://example.com",
        "research_interests": ["Deep Learning", "FastAPI"],
    }
    resp = await client.put(
        f"/api/v1/events/{event_id}/speakers/{speaker_id}/profile",
        params={"token": speaker.upload_token},
        json=profile_data
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["designation"] == "Prof."
    assert data["organisation_name"] == "AI Institute"
    assert data["last_updated_by"] == "speaker"

    # 3. Retrieve profile (GET)
    resp = await client.get(
        f"/api/v1/events/{event_id}/speakers/{speaker_id}/profile",
        params={"token": speaker.upload_token}
      )
    assert resp.status_code == 200
    data = resp.json()
    assert data["designation"] == "Prof."
    assert data["profile_completeness"] > 0
