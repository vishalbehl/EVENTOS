import uuid
import httpx
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.session import Session
from app.models.speaker import Speaker
from app.models.session_speaker import SessionSpeaker
from app.models.presentation_file import PresentationFile
from app.models.print_template import PrintTemplate
from app.models.participant_role import ParticipantRole
from app.models.participant import Participant
from app.models.participant_registration import ParticipantRegistration
from app.models.capacity_rule import CapacityRule
from app.models.companion import Companion
from app.models.room import Room
from app.models.poster import Poster
from app.models.badge_models import Badge
from app.models.venue_capacity_rule import VenueCapacityRule
from app.websocket.connection import broadcast_queue_update

from datetime import datetime, date


def _source_root_url(base_url: str, source_type: str) -> str:
    url = base_url.rstrip("/")
    for suffix in ("/api/v1/registration-source", "/api/v1/sync"):
        if url.endswith(suffix):
            return url
    if source_type == "registration_server":
        return f"{url}/api/v1/sync"
    return f"{url}/api/v1/registration-source"

def parse_dt(v):
    if not v:
        return None
    if isinstance(v, (datetime, date)):
        return v
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
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
    Uses PostgreSQL UPSERT to robustly sync the state into the local database.
    """
    logger.info(f"[Sync] Pulling latest queue for event {event_id} from cloud...")
    
    base_url = (source_url or settings.CLOUD_API_URL).rstrip("/")
    effective_source_type = source_type or getattr(settings, "REGISTRATION_FETCH_SOURCE_TYPE", "cloud")
    headers = {}
    if authorization and not api_key:
        headers["Authorization"] = authorization
        url = f"{base_url}/api/v1/events/{event_id}/venue-sync/queue"
    else:
        headers["X-Fetch-Api-Key"] = api_key or settings.CLOUD_DEVICE_KEY
        source_root = _source_root_url(base_url, effective_source_type)
        url = f"{source_root}/events/{event_id}/queue"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url, 
                headers=headers,
                timeout=60.0
            )
            if response.status_code == 404 and "registration-source" in url:
                response = await client.get(
                    f"{_source_root_url(base_url, 'registration_server')}/events/{event_id}/queue",
                    headers=headers,
                    timeout=60.0,
                )
            response.raise_for_status()
            data = response.json()
            
            async with AsyncSessionLocal() as db:
                await _upsert_schedule_data(db, data)
                await db.commit()
            
            logger.info(f"[Sync] Queue sync complete for {event_id}.")
            
    except httpx.HTTPStatusError as e:
        err_msg = f"HTTP {e.response.status_code}: {e.response.text}"
        logger.error(f"[Sync] Failed to pull queue from cloud. {err_msg}")
        with open(r"d:\DEV\conf-platform\sync_error.txt", "w") as f:
            f.write(err_msg)
    except httpx.RequestError as e:
        # A venue can be intentionally offline. Keep the local PostgreSQL
        # snapshot authoritative for operations and retry on the next cycle.
        logger.warning(f"[Sync] Cloud unavailable; continuing with local venue data: {e}")
        with open(r"d:\DEV\conf-platform\sync_error.txt", "w") as f:
            f.write(str(e))
    except Exception as e:
        logger.error(f"[Sync] Failed to pull queue from cloud: {e}")
        with open(r"d:\DEV\conf-platform\sync_error.txt", "w") as f:
            f.write(str(e))


async def _upsert_schedule_data(db: AsyncSession, data: dict):
    """
    Physically writes the JSON schedule data into PostgreSQL using UPSERTs.
    """
    event_id = data["event_id"]

    # 0. UPSERT rooms
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

    # 1. UPSERT print_templates
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

    # 2. UPSERT participant_roles
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

    # 3. UPSERT participants
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

    # 3b. UPSERT registrations
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

    # 3c. UPSERT posters
    for pos_data in data.get("posters", []):
        pos_stmt = insert(Poster).values(
            id=pos_data["id"],
            event_id=event_id,
            speaker_id=pos_data.get("speaker_id"),
            session_id=pos_data.get("session_id"),
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
                "speaker_id": pos_data.get("speaker_id"),
                "session_id": pos_data.get("session_id"),
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

    # 4. UPSERT badges
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

    # 4a. UPSERT companions
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

    # 5. UPSERT sessions & speakers
    sessions = data.get("sessions", [])
    for sess_data in sessions:
        # UPSERT Session
        stmt = insert(Session).values(
            id=sess_data["id"],
            event_id=event_id,
            session_code=sess_data["session_code"],
            name=sess_data["name"],
            room_id=sess_data.get("room_id"),
            start_time=parse_dt(sess_data.get("start_time")),
            end_time=parse_dt(sess_data.get("end_time")),
            status=sess_data.get("status", "draft")
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": stmt.excluded.name,
                "start_time": stmt.excluded.start_time,
                "end_time": stmt.excluded.end_time,
                "status": stmt.excluded.status,
                "room_id": stmt.excluded.room_id
            }
        )
        await db.execute(stmt)

        # UPSERT Speakers and relationships
        for sp_data in sess_data.get("speakers", []):
            if sp_data.get("speaker_id"):
                sp_email = sp_data.get("email") or f"{sp_data.get('first_name', 'speaker').lower()}.{sp_data.get('last_name', 'user').lower()}@{str(sp_data['speaker_id'])[:8]}.local"
                sp_token = sp_data.get("upload_token") or str(uuid.uuid4())
                # Upsert Speaker
                sp_stmt = insert(Speaker).values(
                    id=sp_data["speaker_id"],
                    event_id=event_id,
                    first_name=sp_data["first_name"],
                    last_name=sp_data["last_name"],
                    email=sp_email,
                    upload_token=sp_token
                ).on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "first_name": sp_data["first_name"],
                        "last_name": sp_data["last_name"],
                        "email": sp_email
                    }
                )
                await db.execute(sp_stmt)

                ss_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"{sess_data['id']}-{sp_data['speaker_id']}")
                # Upsert SessionSpeaker
                ss_stmt = insert(SessionSpeaker).values(
                    id=ss_id,
                    session_id=sess_data["id"],
                    speaker_id=sp_data["speaker_id"],
                    talk_order=sp_data["talk_order"],
                    presentation_title=sp_data.get("presentation_title"),
                    talk_duration_minutes=sp_data.get("talk_duration_minutes") or sp_data.get("duration_minutes")
                ).on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "talk_order": sp_data["talk_order"],
                        "presentation_title": sp_data.get("presentation_title"),
                        "talk_duration_minutes": sp_data.get("talk_duration_minutes") or sp_data.get("duration_minutes")
                    }
                )
                await db.execute(ss_stmt)

                # Upsert PresentationFile if exists
                if sp_data.get("file_id"):
                    pf_stmt = insert(PresentationFile).values(
                        id=sp_data["file_id"],
                        event_id=event_id,
                        speaker_id=sp_data["speaker_id"],
                        session_speaker_id=ss_id,
                        original_filename=sp_data.get("original_filename", "presentation.pptx"),
                        stored_filename=sp_data.get("storage_path", "file.pptx"),
                        storage_path=sp_data["storage_path"],
                        file_size_bytes=sp_data.get("file_size_bytes", 1024),
                        mime_type=sp_data.get("mime_type", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
                        file_format=sp_data.get("file_format", "pptx"),
                        upload_status=sp_data.get("upload_status", "approved")
                    ).on_conflict_do_nothing()
                    await db.execute(pf_stmt)

    # 6. UPSERT capacity_rules
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
