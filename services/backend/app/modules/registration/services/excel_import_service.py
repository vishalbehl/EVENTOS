# =============================================================
# Conference Platform — Excel Import Service
# backend/app/services/excel_import_service.py
#
# Parses conference schedule Excel workbooks and creates:
#   - Room records
#   - Session records
#   - Speaker records
#   - SessionSpeaker junction records
# =============================================================

from __future__ import annotations

import hashlib
import io
import re
import uuid
from datetime import datetime, date, time, timezone
try:
    import zoneinfo
except ImportError:
    from backports import zoneinfo  # type: ignore # Python < 3.9 fallback

from loguru import logger
from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.registration.models.import_job import ImportJob
from app.modules.venue.models.room import Room
from app.modules.speakers.models.session import Session
from app.modules.speakers.models.session_speaker import SessionSpeaker
from app.modules.speakers.models.speaker import Speaker
from app.services.timezone_service import get_cached_timezone



# ── Column indices (0-based) ──────────────────────────────────
COL_SESSION_CODE = 0
COL_SESSION_NAME = 1
COL_SESSION_TYPE = 2
COL_ROOM_NAME = 3
COL_START_DT = 4
COL_END_DT = 5
COL_FIRST_NAME = 6
COL_LAST_NAME = 7
COL_EMAIL = 8
COL_PHONE = 9
COL_AFFILIATION = 10
COL_COUNTRY = 11
COL_PRES_TITLE = 12
COL_TALK_START = 13
COL_TALK_END = 14
COL_TALK_ORDER = 15
COL_TALK_DURATION = 16
COL_MODERATOR = 17

# ── Row data container ────────────────────────────────────────

class RowData:
    """Typed container for a single parsed Excel row."""
    __slots__ = (
        "row_num",
        "session_code", "session_name", "session_type",
        "room_name", "start_dt", "end_dt",
        "first_name", "last_name", "email",
        "phone", "affiliation", "country", "designation",
        "presentation_title", "talk_start", "talk_end",
        "talk_order", "talk_duration",
        "moderator_name",
    )

    def __init__(self, row_num: int, cells: list, col_map: dict[str, int], tz_name: Optional[str] = None) -> None:
        self.row_num = row_num
        if tz_name is None:
            tz_name = get_cached_timezone()

        def _str(field: str) -> str:
            idx = col_map.get(field, -1)
            if idx == -1 or idx >= len(cells):
                return ""
            v = cells[idx]
            return str(v).strip() if v is not None else ""

        def _int(field: str) -> Optional[int]:
            idx = col_map.get(field, -1)
            if idx == -1 or idx >= len(cells):
                return None
            v = cells[idx]
            try:
                return int(v) if v is not None else None
            except (TypeError, ValueError):
                return None

        self.session_code = _str("session_code")
        self.session_name = _str("session_name")
        self.session_type = _str("session_type").lower() or "regular"
        self.room_name = _str("room_name")
        self.first_name = _str("first_name")
        self.last_name = _str("last_name")
        self.email = _str("email").lower()
        self.phone = _str("phone") or None
        self.affiliation = _str("affiliation") or None
        self.country = _str("country") or None
        self.designation = _str("designation") or None
        self.presentation_title = _str("presentation_title") or None
        self.talk_order = _int("talk_order") or 0
        self.talk_duration = _int("talk_duration")
        self.moderator_name = _str("moderator_name") or None

        # Parse datetimes (Session)
        raw_start = cells[col_map["start_dt"]] if "start_dt" in col_map and col_map["start_dt"] < len(cells) else None
        raw_end = cells[col_map["end_dt"]] if "end_dt" in col_map and col_map["end_dt"] < len(cells) else None
        self.start_dt = _parse_dt(raw_start, tz_name=tz_name)
        self.end_dt = _parse_dt(raw_end, tz_name=tz_name)

        # Parse talk datetimes (SessionSpeaker)
        base_date = self.start_dt.date() if self.start_dt else None
        raw_talk_start = cells[col_map["talk_start"]] if "talk_start" in col_map and col_map["talk_start"] < len(cells) else None
        raw_talk_end = cells[col_map["talk_end"]] if "talk_end" in col_map and col_map["talk_end"] < len(cells) else None
        self.talk_start = _parse_dt(raw_talk_start, base_date=base_date, tz_name=tz_name)
        self.talk_end = _parse_dt(raw_talk_end, base_date=base_date, tz_name=tz_name)

    def validate(self) -> list[str]:
        """Return a list of validation error messages, empty if valid."""
        errors = []
        if not self.session_code:
            errors.append("session_code is required")
        if not self.session_name:
            errors.append("session_name is required")
        if not self.first_name:
            errors.append("speaker_first_name is required")
        if not self.last_name:
            errors.append("speaker_last_name is required")
        if not self.email or not _is_valid_email(self.email):
            errors.append(f"speaker_email invalid: '{self.email}'")
        if self.start_dt is None:
            errors.append("start_datetime is required and must be a valid datetime")
        if self.end_dt is None:
            errors.append("end_datetime is required and must be a valid datetime")
        if self.start_dt and self.end_dt and self.start_dt >= self.end_dt:
            errors.append("start_datetime must be before end_datetime")
        return errors


class PosterRowData:
    """Typed container for a single parsed ePoster Excel row."""
    __slots__ = (
        "row_num",
        "session_code", "session_name",
        "start_dt", "end_dt",
        "first_name", "last_name", "email",
        "phone", "affiliation", "country", "designation",
        "poster_title", "category", "abstract",
    )

    def __init__(self, row_num: int, cells: list, col_map: dict[str, int], tz_name: Optional[str] = None) -> None:
        self.row_num = row_num
        if tz_name is None:
            tz_name = get_cached_timezone()

        def _str(field: str) -> str:
            idx = col_map.get(field, -1)
            if idx == -1 or idx >= len(cells):
                return ""
            v = cells[idx]
            return str(v).strip() if v is not None else ""

        self.session_code = _str("session_code")
        self.session_name = _str("session_name")
        self.first_name = _str("first_name")
        self.last_name = _str("last_name")
        self.email = _str("email").lower()
        self.phone = _str("phone") or None
        self.affiliation = _str("affiliation") or None
        self.country = _str("country") or None
        self.designation = _str("designation") or None
        self.poster_title = _str("poster_title")
        self.category = _str("category") or None
        self.abstract = _str("abstract") or None

        # Parse datetimes (Session)
        raw_start = cells[col_map["start_dt"]] if "start_dt" in col_map and col_map["start_dt"] < len(cells) else None
        raw_end = cells[col_map["end_dt"]] if "end_dt" in col_map and col_map["end_dt"] < len(cells) else None
        self.start_dt = _parse_dt(raw_start, tz_name=tz_name)
        self.end_dt = _parse_dt(raw_end, tz_name=tz_name)

    def validate(self) -> list[str]:
        errors = []
        if not self.session_code:
            errors.append("session_code is required")
        if not self.session_name:
            errors.append("session_name is required")
        if not self.first_name:
            errors.append("speaker_first_name is required")
        if not self.last_name:
            errors.append("speaker_last_name is required")
        if not self.email or not _is_valid_email(self.email):
            errors.append(f"speaker_email invalid: '{self.email}'")
        if not self.poster_title:
            errors.append("poster_title is required")
        if self.start_dt is None:
            errors.append("start_datetime is required and must be a valid datetime")
        if self.end_dt is None:
            errors.append("end_datetime is required and must be a valid datetime")
        return errors


# ── Helpers ───────────────────────────────────────────────────

from datetime import datetime, date, time, timezone

def _parse_dt(value, base_date: Optional[date] = None, tz_name: Optional[str] = None) -> Optional[datetime]:
    """
    Parse Excel cell values as timezone-aware UTC datetime.
    Supports datetime objects, time objects (combined with base_date), 
    and various string formats.
    
    If value is naive (no tzinfo), it is assumed to be in 'tz_name' and
    then converted to UTC.
    """
    if value is None:
        return None
        
    if tz_name is None:
        tz_name = get_cached_timezone()
        
    try:
        tz = zoneinfo.ZoneInfo(tz_name)
    except Exception:
        logger.warning(f"Invalid timezone '{tz_name}', falling back to UTC")
        tz = zoneinfo.ZoneInfo("UTC")

    # 1. Already a datetime object
    if isinstance(value, datetime):
        if value.tzinfo is None:
            # Assume local (tz_name) then convert to UTC
            return value.replace(tzinfo=tz).astimezone(timezone.utc)
        return value.astimezone(timezone.utc)
        
    # 2. Excel time object (requires base_date to become a datetime)
    if isinstance(value, time):
        if base_date:
            dt = datetime.combine(base_date, value)
            return dt.replace(tzinfo=tz).astimezone(timezone.utc)
        return None

    # 3. String parsing
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
            
        # Try full datetime formats first
        formats = [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%d/%m/%Y %H:%M",
            "%m/%d/%Y %H:%M",
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(value, fmt)
                return dt.replace(tzinfo=tz).astimezone(timezone.utc)
            except ValueError:
                continue
                
        # Try time-only formats if we have a base_date
        if base_date:
            time_formats = ["%H:%M:%S", "%H:%M", "%I:%M %p", "%I:%M%p"]
            for fmt in time_formats:
                try:
                    t = datetime.strptime(value, fmt).time()
                    dt = datetime.combine(base_date, t)
                    return dt.replace(tzinfo=tz).astimezone(timezone.utc)
                except ValueError:
                    continue
                    
    return None


def _is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


def _generate_upload_token() -> str:
    """Generate a unique upload token for a new speaker."""
    raw = str(uuid.uuid4())
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Workbook parser ───────────────────────────────────────────

def parse_workbook(workbook_bytes: bytes, tz_name: Optional[str] = None, is_poster: bool = False) -> list[RowData | PosterRowData]:
    """
    Load an Excel workbook from bytes and parse all data rows.
    """
    if tz_name is None:
        tz_name = get_cached_timezone()
    wb = load_workbook(filename=io.BytesIO(workbook_bytes), read_only=True, data_only=True)

    # Use a sheet named "Schedule" if it exists, otherwise the first sheet
    sheet_name = "Schedule" if "Schedule" in wb.sheetnames else wb.sheetnames[0]
    ws: Worksheet = wb[sheet_name]

    # Dynamically match headers to indices if header row is present
    first_row = next(ws.iter_rows(max_row=1, values_only=True), [])
    headers = [str(h).strip().lower().replace("_", " ").replace(" ", "") if h is not None else "" for h in first_row]

    if is_poster:
        col_map = {
            "session_code": 0,
            "session_name": 1,
            "start_dt": 4,
            "end_dt": 5,
            "first_name": 6,
            "last_name": 7,
            "email": 8,
            "phone": 9,
            "affiliation": 10,
            "country": 11,
            "designation": -1,
            "poster_title": 12,
            "category": 13,
            "abstract": 14,
        }
    else:
        col_map = {
            "session_code": 0,
            "session_name": 1,
            "session_type": 2,
            "room_name": 3,
            "start_dt": 4,
            "end_dt": 5,
            "first_name": 6,
            "last_name": 7,
            "email": 8,
            "phone": 9,
            "affiliation": 10,
            "country": 11,
            "designation": -1,
            "presentation_title": 12,
            "talk_start": 13,
            "talk_end": 14,
            "talk_order": 15,
            "talk_duration": 16,
            "moderator_name": 17,
        }

    field_synonyms = {
        "sessioncode": "session_code", "sessioncode*": "session_code",
        "sessionname": "session_name", "sessionname*": "session_name",
        "sessiontype": "session_type",
        "roomname": "room_name",
        "startdatetime": "start_dt", "startdatetime*": "start_dt",
        "enddatetime": "end_dt", "enddatetime*": "end_dt",
        "speakerfirstname": "first_name", "speakerfirstname*": "first_name", "firstname": "first_name", "firstname*": "first_name",
        "speakerlastname": "last_name", "speakerlastname*": "last_name", "lastname": "last_name", "lastname*": "last_name",
        "speakeremail": "email", "speakeremail*": "email", "email": "email", "email*": "email",
        "speakerphone": "phone", "phone": "phone",
        "speakeraffiliation": "affiliation", "affiliation": "affiliation", "company": "affiliation",
        "speakercountry": "country", "country": "country",
        "speakerdesignation": "designation", "designation": "designation", "jobtitle": "designation",
        "presentationtitle": "presentation_title", "presentation": "presentation_title", "poster_title": "poster_title", "postertitle": "poster_title", "postertitle*": "poster_title",
        "talkstarttime": "talk_start", "talkstart": "talk_start",
        "talkendtime": "talk_end", "talkend": "talk_end",
        "talkorder": "talk_order",
        "talkdurationmin": "talk_duration", "duration": "talk_duration",
        "moderatorname": "moderator_name", "moderator": "moderator_name",
        "category": "category",
        "abstract": "abstract",
    }

    for idx, h in enumerate(headers):
        if h in field_synonyms:
            col_map[field_synonyms[h]] = idx

    rows: list[RowData | PosterRowData] = []
    for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        # Skip completely empty rows
        if all(cell is None or str(cell).strip() == "" for cell in row):
            continue
        
        if is_poster:
            rows.append(PosterRowData(row_num, list(row), col_map, tz_name=tz_name))
        else:
            rows.append(RowData(row_num, list(row), col_map, tz_name=tz_name))

    wb.close()
    return rows


# ── Database import pipeline ──────────────────────────────────

async def run_import(
    db: AsyncSession,
    job: ImportJob,
    workbook_bytes: bytes,
    event_id: uuid.UUID,
    organization_id: uuid.UUID,
    import_type: str = "schedule",
) -> None:
    """
    Full import pipeline. Called by the Celery worker (or directly for testing).
    """
    # ── Session Configuration ──────────────────────────────────
    # Disable expire_on_commit to keep cached objects (rooms, sessions) 
    # accessible across batch commits during the import loop.
    db.expire_on_commit = False

    logger.info(f"Starting import for job {job.id}, event {event_id}")

    # ── Fetch Event Timezone ──────────────────────────────────
    from app.modules.rbac.models.event import Event
    event_res = await db.execute(select(Event).where(Event.id == event_id))
    event_obj = event_res.scalar_one_or_none()
    tz_name = (event_obj.timezone if event_obj else None) or get_cached_timezone()

    # ── Parse ────────────────────────────────────────────────
    try:
        is_poster = import_type == "eposter"
        all_rows = parse_workbook(workbook_bytes, tz_name=tz_name, is_poster=is_poster)
    except Exception as exc:
        job.status = "failed"
        job.error_summary = [{"row": 0, "error": f"Could not parse workbook: {exc}"}]
        await db.commit()
        logger.error(f"Import job {job.id} failed at parse: {exc}")
        return

    job.rows_total = len(all_rows)
    job.status = "importing"
    job.rows_updated = 0
    await db.commit()

    # ── Caches (in-memory for this import run) ────────────────
    room_cache: dict[str, Room] = {}        # room_name → Room
    session_cache: dict[str, Session] = {}  # session_code → Session
    speaker_cache: dict[str, Speaker] = {}  # email → Speaker

    # ── Counters ──────────────────────────────────────────────
    rows_imported = 0
    rows_failed = 0
    error_summary: list[dict] = []
    
    # Track stats locally to avoid accessing expired 'job' attributes after commits
    stats = {
        "rows_updated": 0,
        "sessions_created": 0,
        "speakers_created": 0,
        "rooms_created": 0,
    }

    # ── Process each row ──────────────────────────────────────
    for i, row in enumerate(all_rows, 1):
        validation_errors = row.validate()
        if validation_errors:
            rows_failed += 1
            error_summary.append({
                "row": row.row_num,
                "errors": validation_errors,
                "data": {
                    "session_code": row.session_code,
                    "email": row.email,
                },
            })
            continue

        try:
            # ── Room ─────────────────────────────────────────
            room_name = row.room_name if hasattr(row, "room_name") else "EPoster Hall"
            room = await _get_or_create_room(
                db, room_cache, room_name, event_id, stats, is_poster=(import_type == "eposter")
            )

            # ── Session ──────────────────────────────────────
            session = await _get_or_create_session(
                db, session_cache, row, event_id, room.id, stats
            )

            # ── Speaker ──────────────────────────────────────
            speaker = await _get_or_create_speaker(
                db, speaker_cache, row, event_id, event_obj.name if event_obj else "Event", stats
            )

            # ── ePoster (If applicable) ───────────────────────
            if import_type == "eposter":
                await _get_or_create_poster(
                    db, speaker.id, session.id, row, event_id, stats
                )
            else:
                # ── SessionSpeaker junction (Standard only) ───────
                await _get_or_create_session_speaker(
                    db, session.id, speaker.id, row, stats
                )

            rows_imported += 1
            
            # Periodically commit to avoid losing all progress if a later row fails
            if i % 10 == 0:
                await db.commit()
                logger.debug(f"Committed batch up to row {row.row_num}")

        except Exception as exc:
            rows_failed += 1
            error_summary.append({
                "row": row.row_num,
                "error": f"Database error: {str(exc)[:200]}",
                "data": {"session_code": row.session_code, "email": row.email},
            })
            logger.warning(f"Row {row.row_num} failed: {exc}")
            await db.rollback()  # Rollback current failed row (and uncommitted batch)
            # Re-fetch caches for next rows if needed, though most are persisted
            
    # Final commit for remaining rows
    await db.commit()

    # ── Finalise job ──────────────────────────────────────────
    # Re-fetch job to ensure it's attached to the current session if it was expired
    result = await db.execute(select(ImportJob).where(ImportJob.id == job.id))
    job = result.scalar_one()

    job.status = "completed"
    job.rows_imported = rows_imported
    job.rows_failed = rows_failed
    job.rows_updated = stats["rows_updated"]
    job.sessions_created = stats["sessions_created"]
    job.speakers_created = stats["speakers_created"]
    job.rooms_created = stats["rooms_created"]
    job.error_summary = error_summary if error_summary else None
    job.completed_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info(
        f"Import job {job.id} complete: {rows_imported} imported, "
        f"{rows_failed} failed, {len(session_cache)} sessions, "
        f"{len(speaker_cache)} speakers, {len(room_cache)} rooms"
    )


# ── Upsert helpers ────────────────────────────────────────────

async def _get_or_create_room(
    db: AsyncSession,
    cache: dict[str, Room],
    name: str,
    event_id: uuid.UUID,
    stats: dict,
    is_poster: bool = False,
) -> Room:
    """Return existing room or create a new one. Uses in-memory cache. Updates if changed."""
    key = name.strip().lower()
    if key in cache:
        return cache[key]

    # If is_poster, try to find ANY room with type eposter first if name matches "EPoster Hall"
    if is_poster:
        result = await db.execute(
            select(Room).where(
                Room.event_id == event_id,
                Room.room_type == "poster"
            )
        )
        room = result.scalar_one_or_none()
        if room:
            cache[key] = room
            return room

    result = await db.execute(
        select(Room).where(
            Room.event_id == event_id,
            Room.name == name,
        )
    )
    room = result.scalar_one_or_none()

    if room is None:
        room = Room(
            event_id=event_id, 
            name=name, 
            room_type="poster" if is_poster else "presentation",
            screen_count=1 if is_poster else 1
        )
        db.add(room)
        await db.flush()
        logger.debug(f"Created room: {name}")
        stats["rooms_created"] += 1
    # For rooms, name is key so no update needed. Future: add capacity etc from Excel if col added.

    cache[key] = room
    return room


async def _get_or_create_session(
    db: AsyncSession,
    cache: dict[str, Session],
    row: RowData,
    event_id: uuid.UUID,
    room_id: uuid.UUID,
    stats: dict,
) -> Session:
    """Return existing session (by code) or create a new one. Update if changed."""
    key = row.session_code.strip().lower()
    if key in cache:
        return cache[key]

    result = await db.execute(
        select(Session).where(
            Session.event_id == event_id,
            Session.session_code == row.session_code,
        )
    )
    session = result.scalar_one_or_none()

    updated = False
    if session is None:
        session_type = row.session_type if hasattr(row, "session_type") else "poster"
        moderator_name = row.moderator_name if hasattr(row, "moderator_name") else None
        
        session = Session(
            event_id=event_id,
            room_id=room_id,
            session_code=row.session_code,
            name=row.session_name,
            session_type=session_type,
            start_time=row.start_dt,
            end_time=row.end_dt,
            moderator_name=moderator_name,
        )
        db.add(session)
        await db.flush()
        logger.debug(f"Created session: {row.session_code} — {row.session_name}")
        stats["sessions_created"] += 1
    else:
        # Update if changed
        session_type = row.session_type if hasattr(row, "session_type") else "poster"
        moderator_name = row.moderator_name if hasattr(row, "moderator_name") else None
        
        if (session.name != row.session_name or
            session.session_type != session_type or
            session.start_time != row.start_dt or
            session.end_time != row.end_dt or
            session.room_id != room_id or
            session.moderator_name != moderator_name):
            session.name = row.session_name
            session.session_type = session_type
            session.start_time = row.start_dt
            session.end_time = row.end_dt
            session.room_id = room_id
            session.moderator_name = moderator_name
            await db.flush()
            updated = True
            logger.debug(f"Updated session: {row.session_code}")

    if updated:
        stats["rows_updated"] += 1

    cache[key] = session
    return session


async def _get_or_create_speaker(
    db: AsyncSession,
    cache: dict[str, Speaker],
    row: RowData,
    event_id: uuid.UUID,
    event_name: str,
    stats: dict,
) -> Speaker:
    """Return existing speaker (by email within event) or create a new one. Update if changed."""
    key = row.email.strip().lower()
    if key in cache:
        return cache[key]

    result = await db.execute(
        select(Speaker).where(
            Speaker.event_id == event_id,
            func.lower(Speaker.email) == row.email.lower(),
        )
    )
    speaker = result.scalar_one_or_none()

    updated = False
    if speaker is None:
        token = _generate_upload_token()
        speaker = Speaker(
            event_id=event_id,
            first_name=row.first_name,
            last_name=row.last_name,
            email=row.email,
            phone=row.phone,
            affiliation=row.affiliation,
            country=row.country,
            designation=row.designation,
            upload_token=token,
            speaker_code=token[:8].upper(),
            upload_status="pending",
        )
        db.add(speaker)
        await db.flush()
        
        # ── Generate QR Code ──
        from app.services import qr_service
        try:
            qr_url = qr_service.generate_and_upload_speaker_qr(
                speaker.id, speaker.full_name, event_name, speaker.speaker_code
            )
            speaker.qr_code_url = qr_url
            await db.flush()
        except Exception as e:
            logger.warning(f"Failed to generate QR for speaker {speaker.id}: {e}")

        logger.debug(f"Created speaker: {speaker.full_name} ({row.email})")
        stats["speakers_created"] += 1
    else:
        # Update profile if changed
        if (speaker.first_name != row.first_name or
            speaker.last_name != row.last_name or
            speaker.phone != row.phone or
            speaker.affiliation != row.affiliation or
            speaker.country != row.country or
            speaker.designation != row.designation):
            speaker.first_name = row.first_name
            speaker.last_name = row.last_name
            speaker.phone = row.phone
            speaker.affiliation = row.affiliation
            speaker.country = row.country
            speaker.designation = row.designation
            await db.flush()
            updated = True
            logger.debug(f"Updated speaker profile: {row.email}")

    if updated:
        stats["rows_updated"] += 1

    cache[key] = speaker
    return speaker


async def _get_or_create_session_speaker(
    db: AsyncSession,
    session_id: uuid.UUID,
    speaker_id: uuid.UUID,
    row: RowData,
    stats: dict,
) -> SessionSpeaker:
    """Return existing session-speaker link or create one. Update if changed."""
    result = await db.execute(
        select(SessionSpeaker).where(
            SessionSpeaker.session_id == session_id,
            SessionSpeaker.speaker_id == speaker_id,
        )
    )
    ss = result.scalar_one_or_none()

    updated = False
    if ss is None:
        logger.debug(f"Creating new SessionSpeaker for session {session_id}, speaker {speaker_id}")
        ss = SessionSpeaker(
            session_id=session_id,
            speaker_id=speaker_id,
            presentation_title=row.presentation_title,
            talk_order=row.talk_order,
            talk_duration_minutes=row.talk_duration,
            start_time=row.talk_start,
            end_time=row.talk_end,
        )
        db.add(ss)
        await db.flush()
        stats["rows_updated"] += 1
        return ss
    else:
        # Update talk details
        # We check for differences and update if needed
        has_changes = (
            ss.presentation_title != row.presentation_title or
            ss.talk_order != row.talk_order or
            ss.talk_duration_minutes != row.talk_duration or
            ss.start_time != row.talk_start or
            ss.end_time != row.talk_end
        )
        
        if has_changes:
            logger.info(f"Updating SessionSpeaker {ss.id}: title='{row.presentation_title}', start={row.talk_start}, duration={row.talk_duration}")
            ss.presentation_title = row.presentation_title
            ss.talk_order = row.talk_order
            ss.talk_duration_minutes = row.talk_duration
            ss.start_time = row.talk_start
            ss.end_time = row.talk_end
            await db.flush()
            stats["rows_updated"] += 1
            
        return ss


async def _get_or_create_poster(
    db: AsyncSession,
    speaker_id: uuid.UUID,
    session_id: uuid.UUID,
    row: PosterRowData,
    event_id: uuid.UUID,
    stats: dict,
) -> "Poster":
    from app.modules.presentations.models.poster import Poster
    
    # Check if speaker already has a poster with this title in this event
    result = await db.execute(
        select(Poster).where(
            Poster.event_id == event_id,
            Poster.speaker_id == speaker_id,
            # Use fuzzy title matching or just link to the session if it's unique per speaker
            or_(
                func.lower(Poster.title) == row.poster_title.lower(),
                Poster.session_id == session_id
            )
        )
    )
    poster = result.scalar_one_or_none()
    
    if poster is None:
        poster = Poster(
            event_id=event_id,
            speaker_id=speaker_id,
            session_id=session_id,
            title=row.poster_title,
            category=row.category,
            abstract=row.abstract,
            status="pending",
            display_order=0
        )
        db.add(poster)
        await db.flush()
        logger.debug(f"Created poster: {row.poster_title}")
        stats["rows_updated"] += 1
    else:
        # Update metadata if changed
        if (poster.category != row.category or 
            poster.abstract != row.abstract or
            poster.session_id != session_id):
            poster.category = row.category
            poster.abstract = row.abstract
            poster.session_id = session_id
            await db.flush()
            stats["rows_updated"] += 1
            
    return poster
