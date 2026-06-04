# tests/test_speaker_profile_system.py
from __future__ import annotations

import io
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.speakers.models.speaker import Speaker
from app.modules.speakers.routers.portal import calculate_profile_completeness
from app.modules.speakers.services import profile_parser


def test_calculate_profile_completeness():
    # Test completeness calculation
    mock_speaker = Speaker(
        first_name="Jane",
        last_name="Doe",
        email="jane@doe.com",
        photo_url=None,
        bio=None,
        designation=None,
        affiliation=None,
        country=None,
        social_links=None,
        research_interests=None,
    )

    assert calculate_profile_completeness(mock_speaker) == 0

    mock_speaker.photo_url = "https://example.com/photo.png"
    assert calculate_profile_completeness(mock_speaker) == 20

    mock_speaker.bio = "A short biography here."
    assert calculate_profile_completeness(mock_speaker) == 40

    mock_speaker.designation = "Professor"
    assert calculate_profile_completeness(mock_speaker) == 55

    mock_speaker.affiliation = "Stanford University"
    assert calculate_profile_completeness(mock_speaker) == 70

    mock_speaker.country = "USA"
    assert calculate_profile_completeness(mock_speaker) == 80

    mock_speaker.social_links = {"linkedin": "https://linkedin.com/in/janedoe"}
    assert calculate_profile_completeness(mock_speaker) == 90

    mock_speaker.research_interests = ["AI", "Robotics"]
    assert calculate_profile_completeness(mock_speaker) == 100


def test_docx_template_generation_and_parsing():
    # Generate DOCX template
    docx_bytes = profile_parser.generate_profile_docx_template(
        speaker_name="Jane Doe",
        talk_title="Deep Learning in EventOS",
        session_code="SES-001",
        date_time="2026-06-01 10:00"
    )
    assert len(docx_bytes) > 0

    # Parse template
    profile_data, photo = profile_parser.parse_profile_docx_template(docx_bytes)
    assert "designation" in profile_data
    # It contains default instruction text/placeholders
    assert "Enter your designation" in profile_data["designation"]
    assert photo is None


def test_pptx_template_generation_and_parsing():
    # Generate PPTX template
    pptx_bytes = profile_parser.generate_profile_pptx_template(
        speaker_name="Jane Doe",
        talk_title="Deep Learning in EventOS",
        session_code="SES-001",
        date_time="2026-06-01 10:00"
    )
    assert len(pptx_bytes) > 0

    # Parse template
    profile_data, photo = profile_parser.parse_profile_pptx_template(pptx_bytes)
    assert "designation" in profile_data
    assert "Enter Designation Here" in profile_data["designation"]
    assert photo is None


def test_pdf_cv_parsing_heuristics(mocker):
    mock_page = mocker.MagicMock()
    mock_page.extract_text.return_value = (
        "John Doe\n"
        "Lead Researcher of Neural Networks\n"
        "MIT Media Lab\n"
        "Cambridge, MA\n\n"
        "Biography:\n"
        "Currently a researcher at MIT working on generative models. Received her PhD from Berkeley. "
        "Her research interests include deep learning and computer vision."
    )
    mock_pdf = mocker.MagicMock()
    mock_pdf.pages = [mock_page]

    mocker.patch("pdfplumber.open", return_value=mocker.MagicMock(__enter__=lambda s: mock_pdf, __exit__=lambda s, *a: None))

    res = profile_parser.extract_text_from_cv_pdf(b"dummy_pdf_bytes")
    assert "Researcher" in res["designation"]
    assert "MIT" in res["affiliation"]
    assert "Generative models" in res["bio"] or "generative" in res["bio"].lower()


@pytest.mark.asyncio
async def test_get_profile_template_endpoint(
    client: AsyncClient,
    db: AsyncSession,
    speaker: Speaker,
):
    # Enable speaker portal
    speaker.event.speaker_mode_enabled = True
    db.add(speaker.event)
    await db.commit()

    # Request DOCX
    resp = await client.get(f"/api/v1/portal/profile/template?token={speaker.upload_token}&format=docx")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert "Profile_Template.docx" in resp.headers["content-disposition"]

    # Request PPTX
    resp = await client.get(f"/api/v1/portal/profile/template?token={speaker.upload_token}&format=pptx")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    assert "Profile_Template.pptx" in resp.headers["content-disposition"]


@pytest.mark.asyncio
async def test_upload_profile_cv_endpoint(
    client: AsyncClient,
    db: AsyncSession,
    speaker: Speaker,
    mocker,
):
    # Enable speaker portal
    speaker.event.speaker_mode_enabled = True
    db.add(speaker.event)
    await db.commit()

    # Mock PDF CV extraction
    mocker.patch(
        "app.modules.speakers.services.profile_parser.extract_text_from_cv_pdf",
        return_value={"designation": "Associate Professor", "affiliation": "Oxford University", "bio": "Extracted biography text."}
    )

    # Perform PDF upload
    files = {"file": ("cv.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    resp = await client.post(f"/api/v1/portal/profile/cv/upload?token={speaker.upload_token}", files=files)
    
    assert resp.status_code == 200
    data = resp.json()
    assert data["designation"] == "Associate Professor"
    assert data["affiliation"] == "Oxford University"
    assert data["bio"] == "Extracted biography text."


@pytest.mark.asyncio
async def test_upload_profile_photo_endpoint(
    client: AsyncClient,
    db: AsyncSession,
    speaker: Speaker,
):
    # Enable speaker portal
    speaker.event.speaker_mode_enabled = True
    db.add(speaker.event)
    await db.commit()

    # Perform photo upload
    files = {"file": ("photo.png", b"\x89PNG dummy", "image/png")}
    resp = await client.post(f"/api/v1/portal/profile/photo?token={speaker.upload_token}", files=files)

    assert resp.status_code == 200
    data = resp.json()
    assert "photo_url" in data
    assert "profile_photo.png" in data["photo_url"]


@pytest.mark.asyncio
async def test_update_speaker_profile_and_completeness_endpoint(
    client: AsyncClient,
    db: AsyncSession,
    speaker: Speaker,
):
    # Enable speaker portal
    speaker.event.speaker_mode_enabled = True
    db.add(speaker.event)
    await db.commit()

    # 1. Update speaker fields
    resp = await client.patch(
        f"/api/v1/portal/profile?token={speaker.upload_token}",
        json={
            "designation": "Lead Developer",
            "affiliation": "EventOS Tech",
            "country": "Germany",
            "bio": "Expert in event infrastructure systems.",
            "phone": "+49111222333",
            "social_links": {"linkedin": "https://linkedin.com/in/example"},
            "research_interests": ["FastAPI", "WebSockets"]
        }
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["designation"] == "Lead Developer"
    assert data["affiliation"] == "EventOS Tech"
    assert data["country"] == "Germany"
    assert data["phone"] == "+49111222333"
    assert data["social_links"] == {"linkedin": "https://linkedin.com/in/example"}
    assert data["research_interests"] == ["FastAPI", "WebSockets"]
    assert data["profile_completeness"] == 80  # missing photo_url (20%) -> 80%

    # 2. Test word limit validation (bio > 400 words)
    long_bio = "word " * 450
    resp_limit = await client.patch(
        f"/api/v1/portal/profile?token={speaker.upload_token}",
        json={"bio": long_bio}
    )
    assert resp_limit.status_code == 400
    assert "Biography exceeds 400 words limit" in resp_limit.json()["detail"]
