import uuid
import httpx
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.event import Event
from app.models.track import Track
from app.models.room import Room
from app.models.session import Session
from app.models.speaker import Speaker
from app.models.session_speaker import SessionSpeaker
from app.models.presentation_file import PresentationFile
from app.models.poster import Poster
from app.models.sponsor import Sponsor, SponsorBooth, SponsorAsset
from app.models.print_template import PrintTemplate
from app.models.participant_role import ParticipantRole
from app.models.participant import Participant
from app.models.participant_registration import ParticipantRegistration
from app.models.participant_extension import ParticipantExtension
from app.models.companion import Companion
from app.models.badge_models import Printer, Badge, BadgeHistory, BadgePrintJob
from app.models.capacity_rule import CapacityRule
from app.models.venue_capacity_rule import VenueCapacityRule
from app.models.kit_models import Kit, ParticipantKit
from app.models.room_device import RoomDevice
from app.models.venue_node import VenueNodeAssignment
from app.models.venue_checkin import VenueCheckIn
from app.websocket.connection import broadcast_queue_update

from datetime import datetime, date


def _strip_source_suffix(base_url: str) -> str:
    url = base_url.rstrip("/")
    for suffix in ("/api/v1/registration-source", "/api/v1/sync"):
        if url.endswith(suffix):
            return url[: -len(suffix)].rstrip("/")
    return url


def _source_root_url(base_url: str, source_type: str = "cloud") -> str:
    url = _strip_source_suffix(base_url)
    if source_type == "registration_server":
        return f"{url}/api/v1/registration-source"
    return f"{url}/api/v1/sync"


def _source_headers(api_key: str) -> dict[str, str]:
    return {
        "X-Fetch-Api-Key": api_key,
        "X-Device-Key": api_key,
    }

def parse_dt(v):
    if not v:
        return None
    if isinstance(v, (datetime, date)):
        return v
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None

def parse_d(v):
    dt = parse_dt(v)
    if dt:
        return dt.date() if isinstance(dt, datetime) else dt
    return None

async def pull_event_queue(
    event_id: str,
    authorization: str = None,
    *,
    source_url: str | None = None,
    api_key: str | None = None,
    source_type: str | None = None,
):
    """
    Pulls the latest queue and schedule state from the Cloud API.
    Uses PostgreSQL UPSERT to robustly sync the state across all 8 domains into the local database.
    """
    logger.info(f"[Sync] Pulling complete 8-schema state for event {event_id} from cloud...")
    
    base_url = (source_url or settings.CLOUD_API_URL).rstrip("/")
    headers = {}
    if authorization and not api_key:
        headers["Authorization"] = authorization
        url = f"{base_url}/api/v1/events/{event_id}/venue-sync/queue"
    else:
        headers.update(_source_headers(api_key or settings.CLOUD_DEVICE_KEY))
        source_root = _source_root_url(base_url, source_type or getattr(settings, "REGISTRATION_FETCH_SOURCE_TYPE", "cloud"))
        url = f"{source_root}/events/{event_id}/queue"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url, 
                headers=headers,
                timeout=60.0
            )
            response.raise_for_status()
            data = response.json()
            
            async with AsyncSessionLocal() as db:
                await _upsert_schedule_data(db, data)
                await db.commit()
            
            await broadcast_queue_update(event_id)
            logger.info(f"[Sync] Complete 8-schema sync finished successfully for event {event_id}.")
            
    except httpx.HTTPStatusError as e:
        err_msg = f"HTTP {e.response.status_code}: {e.response.text}"
        logger.error(f"[Sync] Failed to pull queue from cloud. {err_msg}")
        with open(r"d:\DEV\conf-platform\sync_error.txt", "w") as f:
            f.write(err_msg)
    except httpx.RequestError as e:
        logger.warning(f"[Sync] Cloud unavailable; continuing with local venue data: {e}")
        with open(r"d:\DEV\conf-platform\sync_error.txt", "w") as f:
            f.write(str(e))
    except Exception as e:
        logger.error(f"[Sync] Failed to pull queue from cloud: {e}")
        with open(r"d:\DEV\conf-platform\sync_error.txt", "w") as f:
            f.write(str(e))


async def _upsert_schedule_data(db: AsyncSession, data: dict):
    """
    Physically writes the JSON schedule data into PostgreSQL across all 8 domains using UPSERTs.
    """
    event_id = data["event_id"]

    # 1. UPSERT event metadata & branding settings (if provided)
    if data.get("event"):
        evt_data = data["event"]
        evt_stmt = insert(Event).values(
            id=uuid.UUID(evt_data["id"]),
            organization_id=uuid.UUID(evt_data["organization_id"]),
            name=evt_data["name"],
            short_code=evt_data.get("short_code", "SYNC"),
            status=evt_data.get("status", "draft"),
            timezone=evt_data.get("timezone", "UTC"),
            start_date=parse_d(evt_data.get("start_date")),
            end_date=parse_d(evt_data.get("end_date")),
            location=evt_data.get("location"),
            venue_name=evt_data.get("venue_name"),
            country=evt_data.get("country"),
            state=evt_data.get("state"),
            organizer_name=evt_data.get("organizer_name"),
            organizer_details=evt_data.get("organizer_details", {}),
            license_tier=evt_data.get("license_tier", "starter"),
            feature_toggles=evt_data.get("feature_toggles", {}),
            currency=evt_data.get("currency", "INR"),
            speaker_settings=evt_data.get("speaker_settings", {"enabled": True}),
            registration_settings=evt_data.get("registration_settings", {"enabled": True}),
            branding_settings=evt_data.get("branding_settings", {"theme_color": "#1A73E8"}),
            max_file_size_mb=evt_data.get("max_file_size_mb", 500),
            allowed_formats=evt_data.get("allowed_formats", ["pptx", "pdf", "mp4"]),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": evt_data["name"],
                "short_code": evt_data.get("short_code", "SYNC"),
                "status": evt_data.get("status", "draft"),
                "timezone": evt_data.get("timezone", "UTC"),
                "start_date": parse_d(evt_data.get("start_date")),
                "end_date": parse_d(evt_data.get("end_date")),
                "location": evt_data.get("location"),
                "venue_name": evt_data.get("venue_name"),
                "country": evt_data.get("country"),
                "state": evt_data.get("state"),
                "organizer_name": evt_data.get("organizer_name"),
                "organizer_details": evt_data.get("organizer_details", {}),
                "feature_toggles": evt_data.get("feature_toggles", {}),
                "branding_settings": evt_data.get("branding_settings", {"theme_color": "#1A73E8"}),
                "speaker_settings": evt_data.get("speaker_settings", {"enabled": True}),
                "registration_settings": evt_data.get("registration_settings", {"enabled": True}),
            }
        )
        await db.execute(evt_stmt)

    # 2. UPSERT tracks (Agenda)
    for trk in data.get("tracks", []):
        trk_stmt = insert(Track).values(
            id=uuid.UUID(trk["id"]) if isinstance(trk["id"], str) else trk["id"],
            event_id=uuid.UUID(event_id) if isinstance(event_id, str) else event_id,
            name=trk["name"],
            code=trk.get("code"),
            description=trk.get("description"),
            display_color=trk.get("display_color", "#3b82f6"),
            sort_order=trk.get("sort_order", 0),
            is_active=trk.get("is_active", True),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": trk["name"],
                "code": trk.get("code"),
                "description": trk.get("description"),
                "display_color": trk.get("display_color", "#3b82f6"),
                "sort_order": trk.get("sort_order", 0),
                "is_active": trk.get("is_active", True),
            }
        )
        await db.execute(trk_stmt)

    # 3. UPSERT rooms (Venue)
    for rm_data in data.get("rooms", []):
        rm_stmt = insert(Room).values(
            id=rm_data["id"],
            event_id=event_id,
            name=rm_data["name"],
            capacity=rm_data.get("capacity"),
            screen_count=rm_data.get("screen_count", 1),
            room_type=rm_data.get("room_type", "presentation"),
            av_technician=rm_data.get("av_technician"),
            location_notes=rm_data.get("location_notes"),
            is_active=rm_data.get("is_active", True)
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": rm_data["name"],
                "capacity": rm_data.get("capacity"),
                "screen_count": rm_data.get("screen_count", 1),
                "room_type": rm_data.get("room_type", "presentation"),
                "av_technician": rm_data.get("av_technician"),
                "location_notes": rm_data.get("location_notes"),
                "is_active": rm_data.get("is_active", True)
            }
        )
        await db.execute(rm_stmt)

    # 4. UPSERT speakers (Speakers Domain)
    for sp_data in data.get("speakers", []):
        sp_id = uuid.UUID(sp_data["id"]) if isinstance(sp_data["id"], str) else sp_data["id"]
        sp_email = sp_data.get("email") or f"speaker.{str(sp_id)[:8]}@eventos.local"
        sp_token = sp_data.get("upload_token") or str(uuid.uuid4())
        sp_stmt = insert(Speaker).values(
            id=sp_id,
            event_id=uuid.UUID(event_id) if isinstance(event_id, str) else event_id,
            first_name=sp_data.get("first_name", "Speaker"),
            last_name=sp_data.get("last_name", ""),
            email=sp_email,
            phone=sp_data.get("phone"),
            designation=sp_data.get("designation"),
            affiliation=sp_data.get("affiliation"),
            country=sp_data.get("country"),
            bio=sp_data.get("bio"),
            photo_url=sp_data.get("photo_url"),
            upload_token=sp_token,
            upload_status=sp_data.get("upload_status", "pending"),
            qr_code_url=sp_data.get("qr_code_url"),
            checked_in_at=parse_dt(sp_data.get("checked_in_at")),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "first_name": sp_data.get("first_name", "Speaker"),
                "last_name": sp_data.get("last_name", ""),
                "email": sp_email,
                "phone": sp_data.get("phone"),
                "designation": sp_data.get("designation"),
                "affiliation": sp_data.get("affiliation"),
                "country": sp_data.get("country"),
                "bio": sp_data.get("bio"),
                "photo_url": sp_data.get("photo_url"),
                "upload_status": sp_data.get("upload_status", "pending"),
                "qr_code_url": sp_data.get("qr_code_url"),
                "checked_in_at": parse_dt(sp_data.get("checked_in_at")),
            }
        )
        await db.execute(sp_stmt)

    # 5. UPSERT sessions (Agenda Domain)
    sessions = data.get("sessions", [])
    for sess_data in sessions:
        sess_id = uuid.UUID(sess_data["id"]) if isinstance(sess_data["id"], str) else sess_data["id"]
        sess_stmt = insert(Session).values(
            id=sess_id,
            event_id=uuid.UUID(event_id) if isinstance(event_id, str) else event_id,
            session_code=sess_data["session_code"],
            name=sess_data["name"],
            session_type=sess_data.get("session_type", "regular"),
            room_id=uuid.UUID(sess_data["room_id"]) if sess_data.get("room_id") else None,
            start_time=parse_dt(sess_data.get("start_time")) or datetime.utcnow(),
            end_time=parse_dt(sess_data.get("end_time")) or datetime.utcnow(),
            status=sess_data.get("status", "scheduled"),
            moderator_name=sess_data.get("moderator_name"),
            description=sess_data.get("description"),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": sess_data["name"],
                "session_code": sess_data["session_code"],
                "session_type": sess_data.get("session_type", "regular"),
                "start_time": parse_dt(sess_data.get("start_time")) or datetime.utcnow(),
                "end_time": parse_dt(sess_data.get("end_time")) or datetime.utcnow(),
                "status": sess_data.get("status", "scheduled"),
                "room_id": uuid.UUID(sess_data["room_id"]) if sess_data.get("room_id") else None,
                "moderator_name": sess_data.get("moderator_name"),
                "description": sess_data.get("description"),
            }
        )
        await db.execute(sess_stmt)

        # Handle inline session speakers if present
        for sp_data in sess_data.get("speakers", []):
            if sp_data.get("speaker_id"):
                sp_id = uuid.UUID(sp_data["speaker_id"]) if isinstance(sp_data["speaker_id"], str) else sp_data["speaker_id"]
                ss_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"{sess_id}-{sp_id}")
                ss_stmt = insert(SessionSpeaker).values(
                    id=ss_id,
                    session_id=sess_id,
                    speaker_id=sp_id,
                    talk_order=sp_data.get("talk_order", 0),
                    presentation_title=sp_data.get("presentation_title"),
                    talk_duration_minutes=sp_data.get("talk_duration_minutes") or sp_data.get("duration_minutes"),
                    is_confirmed=sp_data.get("is_confirmed", False)
                ).on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "talk_order": sp_data.get("talk_order", 0),
                        "presentation_title": sp_data.get("presentation_title"),
                        "talk_duration_minutes": sp_data.get("talk_duration_minutes") or sp_data.get("duration_minutes"),
                        "is_confirmed": sp_data.get("is_confirmed", False)
                    }
                )
                await db.execute(ss_stmt)

    # 5b. UPSERT standalone session_speakers (Agenda Domain)
    for ss_data in data.get("session_speakers", []):
        if ss_data.get("session_id") and ss_data.get("speaker_id"):
            ss_id = uuid.UUID(ss_data["id"]) if isinstance(ss_data["id"], str) else ss_data["id"]
            sess_id = uuid.UUID(ss_data["session_id"]) if isinstance(ss_data["session_id"], str) else ss_data["session_id"]
            sp_id = uuid.UUID(ss_data["speaker_id"]) if isinstance(ss_data["speaker_id"], str) else ss_data["speaker_id"]
            ss_stmt = insert(SessionSpeaker).values(
                id=ss_id,
                session_id=sess_id,
                speaker_id=sp_id,
                talk_order=ss_data.get("talk_order", 0),
                presentation_title=ss_data.get("presentation_title"),
                talk_duration_minutes=ss_data.get("talk_duration_minutes"),
                is_confirmed=ss_data.get("is_confirmed", False)
            ).on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "talk_order": ss_data.get("talk_order", 0),
                    "presentation_title": ss_data.get("presentation_title"),
                    "talk_duration_minutes": ss_data.get("talk_duration_minutes"),
                    "is_confirmed": ss_data.get("is_confirmed", False)
                }
            )
            await db.execute(ss_stmt)

    # 6. UPSERT presentation_files (Presentations Domain)
    for pf_data in data.get("presentation_files", []):
        pf_id = uuid.UUID(pf_data["id"]) if isinstance(pf_data["id"], str) else pf_data["id"]
        sp_id = uuid.UUID(pf_data["speaker_id"]) if isinstance(pf_data["speaker_id"], str) else pf_data["speaker_id"]
        ss_id = uuid.UUID(pf_data["session_speaker_id"]) if pf_data.get("session_speaker_id") else None
        if not ss_id:
            # Fallback to deterministic session-speaker link if needed
            ss_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"ss-{sp_id}")

        # Resolve routing from the authoritative session-speaker relation.
        # Do not accept room/session values supplied only by a client payload.
        routing = (await db.execute(
            select(SessionSpeaker.session_id, Session.room_id)
            .join(Session, Session.id == SessionSpeaker.session_id)
            .where(SessionSpeaker.id == ss_id)
        )).one_or_none()
        if not routing or not routing.room_id:
            logger.warning(f"Skipping presentation {pf_id}: session-speaker has no room routing")
            continue
        routed_session_id, routed_room_id = routing
        
        pf_stmt = insert(PresentationFile).values(
            id=pf_id,
            event_id=uuid.UUID(event_id) if isinstance(event_id, str) else event_id,
            speaker_id=sp_id,
            session_speaker_id=ss_id,
            session_id=routed_session_id,
            room_id=routed_room_id,
            original_filename=pf_data.get("original_filename", "presentation.pptx"),
            stored_filename=pf_data.get("stored_filename", "file.pptx"),
            storage_path=pf_data["storage_path"],
            file_size_bytes=pf_data.get("file_size_bytes", 1024),
            mime_type=pf_data.get("mime_type", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
            file_format=pf_data.get("file_format", "pptx"),
            version_number=pf_data.get("version_number", 1),
            is_current_version=pf_data.get("is_current_version", True),
            upload_source=pf_data.get("upload_source", "web"),
            upload_status=pf_data.get("upload_status", "approved"),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "original_filename": pf_data.get("original_filename", "presentation.pptx"),
                "stored_filename": pf_data.get("stored_filename", "file.pptx"),
                "storage_path": pf_data["storage_path"],
                "file_size_bytes": pf_data.get("file_size_bytes", 1024),
                "mime_type": pf_data.get("mime_type", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
                "file_format": pf_data.get("file_format", "pptx"),
                "session_id": routed_session_id,
                "room_id": routed_room_id,
                "version_number": pf_data.get("version_number", 1),
                "is_current_version": pf_data.get("is_current_version", True),
                "upload_status": pf_data.get("upload_status", "approved"),
            }
        )
        await db.execute(pf_stmt)

    # 7. UPSERT posters (Presentations Domain)
    for pos_data in data.get("posters", []):
        pos_id = uuid.UUID(pos_data["id"]) if isinstance(pos_data["id"], str) else pos_data["id"]
        pos_stmt = insert(Poster).values(
            id=pos_id,
            event_id=uuid.UUID(event_id) if isinstance(event_id, str) else event_id,
            speaker_id=uuid.UUID(pos_data["speaker_id"]) if pos_data.get("speaker_id") else None,
            session_id=uuid.UUID(pos_data["session_id"]) if pos_data.get("session_id") else None,
            title=pos_data["title"],
            authors=pos_data.get("authors", ""),
            abstract=pos_data.get("abstract"),
            file_id=pos_data.get("file_id"),
            storage_path=pos_data.get("storage_path"),
            thumbnail_path=pos_data.get("thumbnail_path"),
            status=pos_data.get("status", "submitted"),
            display_screen=pos_data.get("display_screen"),
            presentation_type=pos_data.get("presentation_type", "eposter"),
            rejection_reason=pos_data.get("rejection_reason")
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "speaker_id": uuid.UUID(pos_data["speaker_id"]) if pos_data.get("speaker_id") else None,
                "session_id": uuid.UUID(pos_data["session_id"]) if pos_data.get("session_id") else None,
                "title": pos_data["title"],
                "authors": pos_data.get("authors", ""),
                "abstract": pos_data.get("abstract"),
                "file_id": pos_data.get("file_id"),
                "storage_path": pos_data.get("storage_path"),
                "thumbnail_path": pos_data.get("thumbnail_path"),
                "status": pos_data.get("status", "submitted"),
                "display_screen": pos_data.get("display_screen"),
                "presentation_type": pos_data.get("presentation_type", "eposter"),
                "rejection_reason": pos_data.get("rejection_reason")
            }
        )
        await db.execute(pos_stmt)

    # 8. UPSERT sponsors, booths, assets (Sponsors Domain)
    for spon_data in data.get("sponsors", []):
        spon_id = uuid.UUID(spon_data["id"]) if isinstance(spon_data["id"], str) else spon_data["id"]
        spon_stmt = insert(Sponsor).values(
            id=spon_id,
            event_id=uuid.UUID(event_id) if isinstance(event_id, str) else event_id,
            name=spon_data["name"],
            tier=spon_data.get("tier", "bronze"),
            website=spon_data.get("website"),
            description=spon_data.get("description"),
            logo_url=spon_data.get("logo_url"),
            is_active=spon_data.get("is_active", True),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": spon_data["name"],
                "tier": spon_data.get("tier", "bronze"),
                "website": spon_data.get("website"),
                "description": spon_data.get("description"),
                "logo_url": spon_data.get("logo_url"),
                "is_active": spon_data.get("is_active", True),
            }
        )
        await db.execute(spon_stmt)

    for booth_data in data.get("sponsor_booths", []):
        b_id = uuid.UUID(booth_data["id"]) if isinstance(booth_data["id"], str) else booth_data["id"]
        b_stmt = insert(SponsorBooth).values(
            id=b_id,
            sponsor_id=uuid.UUID(booth_data["sponsor_id"]) if booth_data.get("sponsor_id") else None,
            location=booth_data["location"],
            size=booth_data.get("size"),
            notes=booth_data.get("notes"),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "location": booth_data["location"],
                "size": booth_data.get("size"),
                "notes": booth_data.get("notes"),
            }
        )
        await db.execute(b_stmt)

    for asset_data in data.get("sponsor_assets", []):
        a_id = uuid.UUID(asset_data["id"]) if isinstance(asset_data["id"], str) else asset_data["id"]
        a_stmt = insert(SponsorAsset).values(
            id=a_id,
            sponsor_id=uuid.UUID(asset_data["sponsor_id"]),
            asset_type=asset_data["asset_type"],
            file_url=asset_data["file_url"],
            title=asset_data.get("title"),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "asset_type": asset_data["asset_type"],
                "file_url": asset_data["file_url"],
                "title": asset_data.get("title"),
            }
        )
        await db.execute(a_stmt)

    # 9. UPSERT print_templates (Design Domain)
    for t_data in data.get("print_templates", []):
        t_stmt = insert(PrintTemplate).values(
            id=t_data["id"],
            event_id=event_id,
            template_name=t_data["template_name"],
            template_type=t_data.get("template_type", "custom"),
            template_data=t_data.get("template_data", {}),
            updated_at=parse_dt(t_data.get("updated_at"))
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "template_name": t_data["template_name"],
                "template_type": t_data.get("template_type", "custom"),
                "template_data": t_data.get("template_data", {}),
                "updated_at": parse_dt(t_data.get("updated_at"))
            }
        )
        await db.execute(t_stmt)

    # 10. UPSERT participant_roles (Registration Domain)
    for rl_data in data.get("participant_roles", []):
        rl_stmt = insert(ParticipantRole).values(
            id=rl_data["id"],
            event_id=event_id,
            category=rl_data.get("category", "General"),
            name=rl_data["name"],
            role_code=rl_data.get("role_code", "REG"),
            is_active=rl_data.get("is_active", True),
            is_default=rl_data.get("is_default", False),
            sort_order=rl_data.get("sort_order", 0)
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "category": rl_data.get("category", "General"),
                "name": rl_data["name"],
                "role_code": rl_data.get("role_code", "REG"),
                "is_active": rl_data.get("is_active", True),
                "is_default": rl_data.get("is_default", False),
                "sort_order": rl_data.get("sort_order", 0)
            }
        )
        await db.execute(rl_stmt)

    # 11. UPSERT participants (Registration Domain)
    for p_data in data.get("participants", []):
        p_stmt = insert(Participant).values(
            id=p_data["id"],
            event_id=event_id,
            regno=p_data.get("regno"),
            name=p_data["name"],
            first_name=p_data.get("first_name", ""),
            last_name=p_data.get("last_name", ""),
            email=p_data.get("email"),
            phone=p_data.get("phone"),
            role=p_data.get("role", "Delegate"),
            company=p_data.get("company"),
            designation=p_data.get("designation"),
            country=p_data.get("country"),
            paid_status=p_data.get("paid_status", "Unpaid"),
            source=p_data.get("source", "offline"),
            custom_fields=p_data.get("custom_fields", {}),
            registered_at=parse_dt(p_data.get("registered_at"))
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "regno": p_data.get("regno"),
                "name": p_data["name"],
                "first_name": p_data.get("first_name", ""),
                "last_name": p_data.get("last_name", ""),
                "email": p_data.get("email"),
                "phone": p_data.get("phone"),
                "role": p_data.get("role", "Delegate"),
                "company": p_data.get("company"),
                "designation": p_data.get("designation"),
                "country": p_data.get("country"),
                "paid_status": p_data.get("paid_status", "Unpaid"),
                "source": p_data.get("source", "offline"),
                "custom_fields": p_data.get("custom_fields", {}),
                "registered_at": parse_dt(p_data.get("registered_at"))
            }
        )
        await db.execute(p_stmt)

    # 12. UPSERT registrations (Registration Domain)
    for r_data in data.get("registrations", []):
        r_stmt = insert(ParticipantRegistration).values(
            id=r_data["id"],
            event_id=event_id,
            participant_id=r_data.get("participant_id"),
            registration_status=r_data.get("registration_status", "submitted"),
            registration_data=r_data.get("registration_data", {}),
            submitted_at=parse_dt(r_data.get("submitted_at")),
            reviewed_by=r_data.get("reviewed_by"),
            reviewed_at=parse_dt(r_data.get("reviewed_at")),
            review_notes=r_data.get("review_notes"),
            waitlist_position=r_data.get("waitlist_position"),
            rejection_reason=r_data.get("rejection_reason")
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "participant_id": r_data.get("participant_id"),
                "registration_status": r_data.get("registration_status", "submitted"),
                "registration_data": r_data.get("registration_data", {}),
                "submitted_at": parse_dt(r_data.get("submitted_at")),
                "reviewed_by": r_data.get("reviewed_by"),
                "reviewed_at": parse_dt(r_data.get("reviewed_at")),
                "review_notes": r_data.get("review_notes"),
                "waitlist_position": r_data.get("waitlist_position"),
                "rejection_reason": r_data.get("rejection_reason")
            }
        )
        await db.execute(r_stmt)

    # 13. UPSERT participant extensions
    for ext_data in data.get("participant_extensions", []):
        ext_stmt = insert(ParticipantExtension).values(
            id=ext_data["id"],
            participant_id=ext_data["participant_id"],
            department=ext_data.get("department"),
            city=ext_data.get("city"),
            dietary_preference=ext_data.get("dietary_preference"),
            emergency_contact=ext_data.get("emergency_contact"),
            notes=ext_data.get("notes"),
            custom_attributes=ext_data.get("custom_attributes", {}),
            created_at=parse_dt(ext_data.get("created_at")) or datetime.utcnow(),
            updated_at=parse_dt(ext_data.get("updated_at")),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "department": ext_data.get("department"),
                "city": ext_data.get("city"),
                "dietary_preference": ext_data.get("dietary_preference"),
                "emergency_contact": ext_data.get("emergency_contact"),
                "notes": ext_data.get("notes"),
                "custom_attributes": ext_data.get("custom_attributes", {}),
                "updated_at": parse_dt(ext_data.get("updated_at")),
            }
        )
        await db.execute(ext_stmt)

    # 14. UPSERT companions
    for c_data in data.get("companions", []):
        c_stmt = insert(Companion).values(
            id=c_data["id"],
            event_id=event_id,
            primary_participant_id=c_data["primary_participant_id"],
            first_name=c_data.get("first_name") or "Guest",
            last_name=c_data.get("last_name") or "",
            relationship=c_data.get("relationship") or "Guest",
            email=c_data.get("email"),
            phone=c_data.get("phone"),
            badge_code=c_data.get("badge_code"),
            badge_status=c_data.get("badge_status", "pending"),
            checked_in=c_data.get("checked_in", False),
            checked_in_at=parse_dt(c_data.get("checked_in_at")),
            dietary_preference=c_data.get("dietary_preference"),
            special_assistance=c_data.get("special_assistance"),
            notes=c_data.get("notes"),
            created_at=parse_dt(c_data.get("created_at")) or datetime.utcnow(),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "event_id": event_id,
                "primary_participant_id": c_data["primary_participant_id"],
                "first_name": c_data.get("first_name") or "Guest",
                "last_name": c_data.get("last_name") or "",
                "relationship": c_data.get("relationship") or "Guest",
                "email": c_data.get("email"),
                "phone": c_data.get("phone"),
                "badge_code": c_data.get("badge_code"),
                "badge_status": c_data.get("badge_status", "pending"),
                "checked_in": c_data.get("checked_in", False),
                "checked_in_at": parse_dt(c_data.get("checked_in_at")),
                "dietary_preference": c_data.get("dietary_preference"),
                "special_assistance": c_data.get("special_assistance"),
                "notes": c_data.get("notes"),
            }
        )
        await db.execute(c_stmt)

    # 15. UPSERT badges
    for b_data in data.get("badges", []):
        b_stmt = insert(Badge).values(
            id=b_data["id"],
            participant_id=b_data["participant_id"],
            badge_code=b_data["badge_code"],
            qr_token=b_data["qr_token"],
            barcode=b_data["barcode"],
            nfc_uid=b_data.get("nfc_uid"),
            template_id=b_data.get("template_id"),
            status=b_data.get("status", "created"),
            issued_at=parse_dt(b_data.get("issued_at")),
            created_at=parse_dt(b_data.get("created_at")),
            updated_at=parse_dt(b_data.get("updated_at"))
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "badge_code": b_data["badge_code"],
                "qr_token": b_data["qr_token"],
                "barcode": b_data["barcode"],
                "nfc_uid": b_data.get("nfc_uid"),
                "template_id": b_data.get("template_id"),
                "status": b_data.get("status", "created"),
                "issued_at": parse_dt(b_data.get("issued_at")),
                "created_at": parse_dt(b_data.get("created_at")),
                "updated_at": parse_dt(b_data.get("updated_at"))
            }
        )
        await db.execute(b_stmt)

    # 16. UPSERT capacity_rules & venue gates
    for r_data in data.get("capacity_rules", []):
        if "station_name" in r_data or "gate_name" in r_data:
            gate_stmt = insert(VenueCapacityRule).values(
                id=r_data["id"],
                gate_name=r_data.get("gate_name") or r_data.get("station_name") or "Check-In Gate",
                gate_type=r_data.get("gate_type") or r_data.get("station_type") or "Room",
                allowed_roles=r_data.get("allowed_roles") or ["All"],
                max_checkins_per_delegate=r_data.get("max_checkins_per_delegate", 0),
                gate_capacity=r_data.get("gate_capacity") or r_data.get("station_capacity") or r_data.get("capacity") or 500,
            ).on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "gate_name": r_data.get("gate_name") or r_data.get("station_name") or "Check-In Gate",
                    "gate_type": r_data.get("gate_type") or r_data.get("station_type") or "Room",
                    "allowed_roles": r_data.get("allowed_roles") or ["All"],
                    "max_checkins_per_delegate": r_data.get("max_checkins_per_delegate", 0),
                    "gate_capacity": r_data.get("gate_capacity") or r_data.get("station_capacity") or r_data.get("capacity") or 500,
                },
            )
            await db.execute(gate_stmt)
            continue
        r_stmt = insert(CapacityRule).values(
            id=r_data["id"],
            event_id=event_id,
            session_id=r_data.get("session_id"),
            room_id=r_data.get("room_id"),
            capacity=r_data.get("capacity") or r_data.get("station_capacity") or r_data.get("gate_capacity") or 500,
            waitlist_enabled=r_data.get("waitlist_enabled", True),
            auto_promote=r_data.get("auto_promote", True),
            priority_enabled=r_data.get("priority_enabled", False)
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "capacity": r_data.get("capacity") or r_data.get("station_capacity") or r_data.get("gate_capacity") or 500,
                "waitlist_enabled": r_data.get("waitlist_enabled", True),
                "auto_promote": r_data.get("auto_promote", True),
                "priority_enabled": r_data.get("priority_enabled", False)
            }
        )
        await db.execute(r_stmt)

    # 17. UPSERT kits
    for kit_data in data.get("kits", []):
        kit_stmt = insert(Kit).values(
            id=kit_data["id"],
            kit_name=kit_data["kit_name"],
            category=kit_data.get("category", "Standard"),
            total_quantity=kit_data.get("total_quantity", 1000),
            distributed_quantity=kit_data.get("distributed_quantity", 0),
            max_per_participant=kit_data.get("max_per_participant", 1),
            description=kit_data.get("description"),
            target_roles=kit_data.get("target_roles", ["All"]),
            created_at=parse_dt(kit_data.get("created_at")) or datetime.utcnow(),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "kit_name": kit_data["kit_name"],
                "category": kit_data.get("category", "Standard"),
                "total_quantity": kit_data.get("total_quantity", 1000),
                "distributed_quantity": kit_data.get("distributed_quantity", 0),
                "max_per_participant": kit_data.get("max_per_participant", 1),
                "description": kit_data.get("description"),
                "target_roles": kit_data.get("target_roles", ["All"]),
            }
        )
        await db.execute(kit_stmt)

    for pk_data in data.get("participant_kits", []):
        pk_stmt = insert(ParticipantKit).values(
            id=pk_data["id"],
            participant_id=pk_data["participant_id"],
            kit_id=pk_data["kit_id"],
            status=pk_data.get("status", "issued"),
            issued_by=pk_data.get("issued_by"),
            issued_at=parse_dt(pk_data.get("issued_at")),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "status": pk_data.get("status", "issued"),
                "issued_by": pk_data.get("issued_by"),
                "issued_at": parse_dt(pk_data.get("issued_at")),
            }
        )
        await db.execute(pk_stmt)

    # 18. UPSERT printers, room_devices, node_assignments
    for pr_data in data.get("printers", []):
        pr_stmt = insert(Printer).values(
            id=pr_data["id"],
            name=pr_data["name"],
            ip_address=pr_data.get("ip_address"),
            location=pr_data.get("location"),
            status=pr_data.get("status", "online"),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": pr_data["name"],
                "ip_address": pr_data.get("ip_address"),
                "location": pr_data.get("location"),
                "status": pr_data.get("status", "online"),
            }
        )
        await db.execute(pr_stmt)

    for dev_data in data.get("room_devices", []):
        dev_stmt = insert(RoomDevice).values(
            id=dev_data["id"],
            event_id=event_id,
            room_id=dev_data.get("room_id"),
            device_type=dev_data.get("device_type", "workstation"),
            device_name=dev_data.get("device_name", "Workstation"),
            hostname=dev_data.get("hostname"),
            mac_address=dev_data.get("mac_address"),
            status=dev_data.get("status", "online"),
            last_heartbeat_at=parse_dt(dev_data.get("last_heartbeat_at")),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "room_id": dev_data.get("room_id"),
                "device_type": dev_data.get("device_type", "workstation"),
                "device_name": dev_data.get("device_name", "Workstation"),
                "hostname": dev_data.get("hostname"),
                "mac_address": dev_data.get("mac_address"),
                "status": dev_data.get("status", "online"),
                "last_heartbeat_at": parse_dt(dev_data.get("last_heartbeat_at")),
            }
        )
        await db.execute(dev_stmt)

    for na_data in data.get("node_assignments", []):
        na_stmt = insert(VenueNodeAssignment).values(
            id=na_data["id"],
            event_id=event_id,
            device_id=na_data["device_id"],
            mode=na_data.get("mode", "registration"),
            station_id=na_data.get("station_id"),
            checkin_gate_id=na_data.get("checkin_gate_id"),
            permissions=na_data.get("permissions", {}),
            status=na_data.get("status", "active"),
            snapshot_version=na_data.get("snapshot_version", 1),
            last_sync_at=parse_dt(na_data.get("last_sync_at")),
            last_heartbeat_at=parse_dt(na_data.get("last_heartbeat_at")),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "mode": na_data.get("mode", "registration"),
                "station_id": na_data.get("station_id"),
                "checkin_gate_id": na_data.get("checkin_gate_id"),
                "permissions": na_data.get("permissions", {}),
                "status": na_data.get("status", "active"),
                "snapshot_version": na_data.get("snapshot_version", 1),
                "last_sync_at": parse_dt(na_data.get("last_sync_at")),
                "last_heartbeat_at": parse_dt(na_data.get("last_heartbeat_at")),
            }
        )
        await db.execute(na_stmt)
