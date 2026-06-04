import io
import re
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db, get_optional_user
from app.modules.rbac.models.event import Event
from app.modules.speakers.models.speaker import Speaker
from app.modules.speakers.models.session import Session
from app.modules.speakers.models.session_speaker import SessionSpeaker
from app.modules.speakers.models.speaker_profile import SpeakerProfile
from app.modules.speakers.schemas.speaker_profile import (
    SpeakerProfileCreate,
    SpeakerProfileUpdate,
    SpeakerProfileResponse,
)
from app.schemas.common import MessageResponse

# Create the router with events prefix
router = APIRouter(prefix="/events/{event_id}/speakers/{speaker_id}/profile", tags=["speaker_profiles"])


async def check_profile_access(
    event_id: uuid.UUID,
    speaker_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[object] = Depends(get_optional_user),
    token: Optional[str] = Query(None),
) -> str:
    """
    Checks if the caller has access to the speaker's profile.
    Returns: 'organiser' if authorized by JWT, 'speaker' if authorized by portal token.
    Raises HTTPException (401/403/404) if unauthorized.
    """
    # 1. Try token auth first
    if token:
        q = select(Speaker).where(
            Speaker.id == speaker_id,
            Speaker.event_id == event_id,
            (Speaker.upload_token == token) | (Speaker.speaker_code == token.upper())
        ).options(selectinload(Speaker.event))
        res = await db.execute(q)
        speaker = res.scalar_one_or_none()
        if speaker:
            # Check if speaker portal is active
            if not speaker.event.speaker_mode_enabled:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Speaker portal is currently closed."
                )
            return "speaker"

    # 2. Try JWT auth
    if current_user:
        # Check if user has organizer-level access to the event
        event_res = await db.execute(select(Event).where(Event.id == event_id))
        event = event_res.scalar_one_or_none()
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")

        # Check organization membership
        if getattr(current_user, "role") != "super_admin":
            if event.organization_id != getattr(current_user, "organization_id"):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")

        # Check role and assignments for organisers and below
        if getattr(current_user, "role") in ["organiser", "session_manager", "technician", "volunteer"]:
            from app.modules.rbac.models.rbac import UserAccessNode
            from app.modules.venue.models.room import Room
            from sqlalchemy import and_, or_
            assignment_check = await db.execute(
                select(UserAccessNode).where(
                    UserAccessNode.user_id == getattr(current_user, "id"),
                    or_(
                        and_(UserAccessNode.node_id == event_id, UserAccessNode.node_type == 'EVENT'),
                        and_(
                            UserAccessNode.node_type == 'ROOM',
                            UserAccessNode.node_id.in_(select(Room.id).where(Room.event_id == event_id))
                        ),
                        and_(
                            UserAccessNode.node_type == 'SESSION',
                            UserAccessNode.node_id.in_(select(Session.id).where(Session.event_id == event_id))
                        )
                    )
                )
            )
            if not assignment_check.scalars().first():
                from app.modules.rbac.models.user_assignment import UserEventAssignment
                legacy_check = await db.execute(
                    select(UserEventAssignment).where(
                        UserEventAssignment.user_id == getattr(current_user, "id"),
                        UserEventAssignment.event_id == event_id
                    )
                )
                if not legacy_check.scalars().first():
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You are not assigned to this event or any of its rooms/sessions."
                    )
        
        # Verify speaker exists in this event
        speaker_exists = await db.scalar(
            select(func.count(Speaker.id)).where(Speaker.id == speaker_id, Speaker.event_id == event_id)
        )
        if not speaker_exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Speaker not found.")
            
        return "organiser"

    # If neither token nor user is present or matches
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Provide a valid token or session.",
    )


@router.get("", response_model=SpeakerProfileResponse)
async def get_speaker_profile(
    event_id: uuid.UUID,
    speaker_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    access_type: str = Depends(check_profile_access),
) -> SpeakerProfileResponse:
    """
    Returns SpeakerProfileResponse or 404 if no profile yet.
    """
    result = await db.execute(
        select(SpeakerProfile).where(
            SpeakerProfile.speaker_id == speaker_id,
            SpeakerProfile.event_id == event_id
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Speaker profile not found."
        )
    return profile


@router.put("", response_model=SpeakerProfileResponse)
async def upsert_speaker_profile(
    event_id: uuid.UUID,
    speaker_id: uuid.UUID,
    payload: SpeakerProfileUpdate,
    db: AsyncSession = Depends(get_db),
    access_type: str = Depends(check_profile_access),
) -> SpeakerProfileResponse:
    """
    Creates or updates the speaker profile.
    Sets last_updated_by='organiser' if called by organiser JWT, 'speaker' if called by portal token.
    """
    # 1. Fetch the speaker to get organization_id
    speaker_res = await db.execute(
        select(Speaker).where(Speaker.id == speaker_id, Speaker.event_id == event_id).options(selectinload(Speaker.event))
    )
    speaker = speaker_res.scalar_one_or_none()
    if not speaker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Speaker not found.")

    # 2. Get profile if exists
    result = await db.execute(
        select(SpeakerProfile).where(
            SpeakerProfile.speaker_id == speaker_id,
            SpeakerProfile.event_id == event_id
        )
    )
    profile = result.scalar_one_or_none()

    update_dict = payload.model_dump(exclude_unset=True)
    update_dict["last_updated_by"] = access_type

    if not profile:
        # Create
        profile = SpeakerProfile(
            speaker_id=speaker_id,
            event_id=event_id,
            organization_id=speaker.event.organization_id,
            **update_dict
        )
        db.add(profile)
    else:
        # Update
        for field, value in update_dict.items():
            setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/parse-cv", response_model=SpeakerProfileUpdate)
async def parse_cv(
    event_id: uuid.UUID,
    speaker_id: uuid.UUID,
    file: UploadFile = File(...),
    access_type: str = Depends(check_profile_access),
) -> SpeakerProfileUpdate:
    """
    PDF only, max 5MB. Uses pdfplumber to extract text.
    Returns: SpeakerProfileUpdate (partial — only fields we could extract, rest None)
    """
    # Check format
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF CV uploads are supported."
        )

    # Check size (max 5MB)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds 5MB limit."
        )

    try:
        import pdfplumber
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CV parsing not available"
        )

    try:
        # Read text
        text = ""
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process PDF content: {str(e)}"
        )

    lines = [line.strip() for line in text.split('\n') if line.strip()]
    if not lines:
        return SpeakerProfileUpdate()

    designation = None
    organisation_name = None
    bio = None

    # Heuristic 1: designation (start of lines Dr./Prof./Mr./Ms.)
    desig_regex = re.compile(r'^(Dr\.|Prof\.|Mr\.|Ms\.)\b', re.IGNORECASE)
    for line in lines:
        match = desig_regex.match(line)
        if match:
            designation = match.group(1).strip().capitalize()
            if designation in ["Mr", "Ms", "Dr", "Prof"]:
                designation = designation + "."
            break

    # Heuristic 2: organisation_name (lines containing University/Hospital/Institute/College)
    keywords = ["university", "hospital", "institute", "college"]
    for i, line in enumerate(lines):
        if any(kw in line.lower() for kw in keywords):
            # Check if next line contains more details or just use current
            if i + 1 < len(lines) and len(lines[i+1]) > 3 and not any(kw in lines[i+1].lower() for kw in keywords):
                organisation_name = lines[i+1]
            else:
                organisation_name = line
            # Clean organisation_name if it has address parts
            organisation_name = organisation_name.split(',')[0].strip()
            break

    # Heuristic 3: bio (first paragraph that is 20+ words and doesn't look like an address)
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    for p in paragraphs:
        # Remove internal linebreaks for counting/cleaning
        clean_p = " ".join(p.split())
        words = clean_p.split()
        if len(words) >= 20:
            p_lower = clean_p.lower()
            # If it looks like contact info or address, skip
            if any(term in p_lower for term in ["street", "road", "zip", "email:", "phone:", "fax:", "tel:"]):
                continue
            bio = clean_p[:500]  # limit to reasonable snippet
            break

    return SpeakerProfileUpdate(
        designation=designation,
        organisation_name=organisation_name,
        bio=bio,
    )


@router.get("/template")
async def get_profile_template(
    event_id: uuid.UUID,
    speaker_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    access_type: str = Depends(check_profile_access),
):
    """
    Generates a DOCX file using python-docx pre-filled with speaker and talk info.
    """
    try:
        import docx
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="python-docx not installed"
        )

    # 1. Fetch speaker
    speaker_res = await db.execute(
        select(Speaker).where(Speaker.id == speaker_id, Speaker.event_id == event_id)
    )
    speaker = speaker_res.scalar_one_or_none()
    if not speaker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Speaker not found.")

    # 2. Fetch event
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")

    # 3. Fetch session speakers
    ss_result = await db.execute(
        select(SessionSpeaker)
        .join(Session, SessionSpeaker.session_id == Session.id)
        .where(SessionSpeaker.speaker_id == speaker_id, Session.event_id == event_id)
        .options(selectinload(SessionSpeaker.session))
    )
    session_speakers = ss_result.scalars().all()

    # Create DOCX
    doc = docx.Document()
    doc.add_heading("Speaker Profile Template", level=0)

    doc.add_paragraph(f"Speaker Name: {speaker.full_name}")
    doc.add_paragraph(f"Event Name: {event.name}")
    doc.add_paragraph(f"Event Dates: {event.start_date} to {event.end_date}")

    doc.add_heading("Assigned Talks", level=2)
    if not session_speakers:
        doc.add_paragraph("No oral presentation talks assigned yet.")
    else:
        for ss in session_speakers:
            doc.add_paragraph(f"- {ss.presentation_title or 'Untitled Talk'} (Session: {ss.session.name})")

    doc.add_heading("Speaker Profile Details", level=2)
    doc.add_paragraph("Please enter your details below. Do not delete or rename the bracketed section labels.")

    sections = [
        ("[DESIGNATION]", "e.g., Dr. / Prof. / Mr. / Ms."),
        ("[SHORT BIO]", "A short bio (max 150 words)"),
        ("[FULL BIO]", "A full extended bio (max 400 words)"),
        ("[ORGANISATION]", "Your university or company name"),
        ("[DEPARTMENT]", "Your department name"),
        ("[RESEARCH INTERESTS — comma separated]", "e.g., Artificial Intelligence, Genomics"),
        ("[WEBSITE]", "e.g., https://academic-page.edu"),
        ("[LINKEDIN]", "e.g., https://linkedin.com/in/username"),
    ]

    for label, placeholder in sections:
        doc.add_paragraph(f"{label}\n{placeholder}\n")

    # Save to buffer
    file_stream = io.BytesIO()
    doc.save(file_stream)
    file_stream.seek(0)

    filename = f"{speaker.full_name.replace(' ', '_')}_profile_template.docx"
    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/parse-template", response_model=SpeakerProfileUpdate)
async def parse_profile_template(
    event_id: uuid.UUID,
    speaker_id: uuid.UUID,
    file: UploadFile = File(...),
    access_type: str = Depends(check_profile_access),
) -> SpeakerProfileUpdate:
    """
    Accepts completed DOCX template, extracts content between section labels.
    """
    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only DOCX template uploads are supported."
        )

    try:
        import docx
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="python-docx not installed"
        )

    try:
        content = await file.read()
        doc = docx.Document(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read DOCX template: {str(e)}"
        )

    labels_map = {
        "[DESIGNATION]": "designation",
        "[SHORT BIO]": "bio",
        "[FULL BIO]": "extended_bio",
        "[ORGANISATION]": "organisation_name",
        "[DEPARTMENT]": "department",
        "[RESEARCH INTERESTS — comma separated]": "research_interests",
        "[WEBSITE]": "website_url",
        "[LINKEDIN]": "linkedin_url"
    }

    current_field = None
    field_lines = {}

    for paragraph in doc.paragraphs:
        trimmed = paragraph.text.strip()
        if not trimmed:
            continue

        matched_label = None
        for label in labels_map:
            if label in trimmed:
                matched_label = label
                break

        if matched_label:
            current_field = labels_map[matched_label]
            field_lines[current_field] = []
        elif current_field is not None:
            # Skip placeholders
            if trimmed.startswith("e.g.") or trimmed.startswith("A short") or trimmed.startswith("A full") or trimmed.startswith("Your university") or trimmed.startswith("Your department"):
                continue
            field_lines[current_field].append(paragraph.text)

    extracted = {}
    for field, lines in field_lines.items():
        val = "\n".join(lines).strip()
        if val:
            if field == "research_interests":
                extracted[field] = [item.strip() for item in val.split(",") if item.strip()]
            else:
                extracted[field] = val

    return SpeakerProfileUpdate(**extracted)
