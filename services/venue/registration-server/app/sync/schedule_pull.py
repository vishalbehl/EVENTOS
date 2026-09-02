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
from app.models.badge_models import Badge, BadgeHistory, BadgePrintJob, BadgeScan, Printer
from app.models.venue_capacity_rule import VenueCapacityRule
from app.models.participant_extension import ParticipantExtension
from app.models.kit_models import Kit, ParticipantKit
from app.models.venue_checkin import VenueCheckIn
from app.models.venue_node import VenueNodeAssignment
from app.models.room_device import RoomDevice
from app.models.action_log import ParticipantActionLog
from app.websocket.connection import broadcast_queue_update

from datetime import datetime, date


def _source_root_url(base_url: str, source_type: str) -> str:
    url = base_url.rstrip("/")
    for suffix in ("/api/v1/registration-source", "/api/v1/sync"):
        if url.endswith(suffix):
            return url
    if source_type in {"registration_server", "venue_server"}:
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
        url = f"{source_root}/events/{event_id}/snapshot"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url, 
                headers=headers,
                timeout=60.0
            )
            if response.status_code == 404:
                response = await client.get(
                    f"{source_root}/events/{event_id}/queue",
                    headers=headers,
                    timeout=60.0,
                )
            response.raise_for_status()
            data = response.json()
            
            async with AsyncSessionLocal() as db:
                await _upsert_schedule_data(db, data)
                await db.commit()
            
            logger.info(f"[Sync] Queue sync complete for {event_id}.")
            await broadcast_queue_update(event_id)
            
    except httpx.HTTPStatusError as e:
        err_msg = f"HTTP {e.response.status_code}: {e.response.text}"
        logger.error(f"[Sync] Failed to pull queue from cloud. {err_msg}")
    except httpx.RequestError as e:
        # A venue can be intentionally offline. Keep the local PostgreSQL
        # snapshot authoritative for operations and retry on the next cycle.
        logger.warning(f"[Sync] Cloud unavailable; continuing with local venue data: {e}")
    except Exception as e:
        logger.error(f"[Sync] Failed to pull queue from cloud: {e}")


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

    # 3c. UPSERT participant extensions
    for ext_data in data.get("participant_extensions", []):
        ext_stmt = insert(ParticipantExtension).values(
            id=ext_data["id"],
            participant_id=ext_data["participant_id"],
            department=ext_data.get("department"),
            city=ext_data.get("city"),
            dietary_preference=ext_data.get("dietary_preference"),
            emergency_contact=ext_data.get("emergency_contact"),
            notes=ext_data.get("notes"),
            custom_attributes=ext_data.get("custom_attributes") or {},
            created_at=parse_dt(ext_data.get("created_at")) or datetime.utcnow(),
            updated_at=parse_dt(ext_data.get("updated_at")) or datetime.utcnow(),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "participant_id": ext_data["participant_id"],
                "department": ext_data.get("department"),
                "city": ext_data.get("city"),
                "dietary_preference": ext_data.get("dietary_preference"),
                "emergency_contact": ext_data.get("emergency_contact"),
                "notes": ext_data.get("notes"),
                "custom_attributes": ext_data.get("custom_attributes") or {},
                "updated_at": parse_dt(ext_data.get("updated_at")) or datetime.utcnow(),
            },
        )
        await db.execute(ext_stmt)

    # Registration Server intentionally skips presentation/poster payloads.
    #
    # The command-center / venue source can include speaker, poster, and
    # presentation-file data for other on-site apps. The Registration Server DB
    # is intentionally registration-focused, so those presentation tables may
    # not exist. Importing them here would make one unrelated table failure roll
    # back participants, roles, companions, badges, and check-in gates.
    if data.get("posters"):
        logger.info(
            "[Sync] Skipping {} poster records on Registration Server; "
            "presentation data is not part of the registration DB.",
            len(data.get("posters", [])),
        )

    # 3d. UPSERT printers before badge print jobs.
    for printer_data in data.get("printers", []):
        printer_stmt = insert(Printer).values(
            id=printer_data["id"],
            name=printer_data.get("name") or "Printer",
            ip_address=printer_data.get("ip_address") or "0.0.0.0",
            location=printer_data.get("location") or "Venue",
            status=printer_data.get("status") or "offline",
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": printer_data.get("name") or "Printer",
                "ip_address": printer_data.get("ip_address") or "0.0.0.0",
                "location": printer_data.get("location") or "Venue",
                "status": printer_data.get("status") or "offline",
            },
        )
        await db.execute(printer_stmt)

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

    # 4b. UPSERT badge history and print queue rows.
    for h_data in data.get("badge_history", []):
        h_stmt = insert(BadgeHistory).values(
            id=h_data["id"],
            badge_id=h_data["badge_id"],
            action=h_data.get("action") or "synced",
            performed_by=h_data.get("performed_by"),
            action_metadata=h_data.get("metadata") or h_data.get("action_metadata") or {},
            created_at=parse_dt(h_data.get("created_at")) or datetime.utcnow(),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "action": h_data.get("action") or "synced",
                "performed_by": h_data.get("performed_by"),
                "action_metadata": h_data.get("metadata") or h_data.get("action_metadata") or {},
            },
        )
        await db.execute(h_stmt)

    for job_data in data.get("badge_print_jobs", []):
        if not job_data.get("printer_id"):
            continue
        job_stmt = insert(BadgePrintJob).values(
            id=job_data["id"],
            badge_id=job_data["badge_id"],
            printer_id=job_data["printer_id"],
            status=job_data.get("status") or "queued",
            queued_at=parse_dt(job_data.get("queued_at")) or datetime.utcnow(),
            printed_at=parse_dt(job_data.get("printed_at")),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "badge_id": job_data["badge_id"],
                "printer_id": job_data["printer_id"],
                "status": job_data.get("status") or "queued",
                "printed_at": parse_dt(job_data.get("printed_at")),
            },
        )
        await db.execute(job_stmt)

    # 4c. UPSERT companions
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

        if sess_data.get("speakers"):
            logger.info(
                "[Sync] Skipping {} speaker/presentation records for session {} "
                "on Registration Server.",
                len(sess_data.get("speakers", [])),
                sess_data.get("id"),
            )

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

    # 7. UPSERT check-in/scanning operational history.
    for checkin_data in data.get("venue_checkins", []):
        checkin_stmt = insert(VenueCheckIn).values(
            id=checkin_data["id"],
            event_id=checkin_data.get("event_id") or event_id,
            participant_id=checkin_data.get("participant_id"),
            companion_id=checkin_data.get("companion_id"),
            checkin_gate_id=checkin_data.get("checkin_gate_id"),
            gate_name=checkin_data.get("gate_name") or checkin_data.get("station_name") or "Check-In Gate",
            gate_type=checkin_data.get("gate_type") or checkin_data.get("station_type") or "registration",
            gate_capacity=checkin_data.get("gate_capacity") or checkin_data.get("station_capacity") or 0,
            badge_code=checkin_data.get("badge_code") or "",
            scan_type=checkin_data.get("scan_type") or "check_in",
            status=checkin_data.get("status") or "success",
            rejection_reason=checkin_data.get("rejection_reason"),
            admin_overridden_by=checkin_data.get("admin_overridden_by"),
            checkin_time=parse_dt(checkin_data.get("checkin_time")) or datetime.utcnow(),
            checkout_time=parse_dt(checkin_data.get("checkout_time")),
            duration=checkin_data.get("duration"),
            session_id=checkin_data.get("session_id"),
            method=checkin_data.get("method") or "qr",
            device_id=checkin_data.get("device_id") or "unknown",
            operation_id=checkin_data.get("operation_id"),
            created_at=parse_dt(checkin_data.get("created_at")) or datetime.utcnow(),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "event_id": checkin_data.get("event_id") or event_id,
                "participant_id": checkin_data.get("participant_id"),
                "companion_id": checkin_data.get("companion_id"),
                "checkin_gate_id": checkin_data.get("checkin_gate_id"),
                "gate_name": checkin_data.get("gate_name") or checkin_data.get("station_name") or "Check-In Gate",
                "gate_type": checkin_data.get("gate_type") or checkin_data.get("station_type") or "registration",
                "gate_capacity": checkin_data.get("gate_capacity") or checkin_data.get("station_capacity") or 0,
                "badge_code": checkin_data.get("badge_code") or "",
                "scan_type": checkin_data.get("scan_type") or "check_in",
                "status": checkin_data.get("status") or "success",
                "rejection_reason": checkin_data.get("rejection_reason"),
                "admin_overridden_by": checkin_data.get("admin_overridden_by"),
                "checkin_time": parse_dt(checkin_data.get("checkin_time")) or datetime.utcnow(),
                "checkout_time": parse_dt(checkin_data.get("checkout_time")),
                "duration": checkin_data.get("duration"),
                "session_id": checkin_data.get("session_id"),
                "method": checkin_data.get("method") or "qr",
                "device_id": checkin_data.get("device_id") or "unknown",
                "operation_id": checkin_data.get("operation_id"),
            },
        )
        await db.execute(checkin_stmt)

    for scan_data in data.get("venue_scan_events", []):
        scan_stmt = insert(BadgeScan).values(
            id=scan_data["id"],
            event_id=scan_data.get("event_id") or event_id,
            participant_id=scan_data.get("participant_id"),
            companion_id=scan_data.get("companion_id"),
            checkin_gate_id=scan_data.get("checkin_gate_id"),
            badge_id=scan_data.get("badge_id"),
            station_name=scan_data.get("station_name") or scan_data.get("gate_name") or "Check-In Gate",
            station_type=scan_data.get("station_type") or scan_data.get("gate_type") or "registration",
            location=scan_data.get("location"),
            badge_code=scan_data.get("badge_code") or "",
            scan_type=scan_data.get("scan_type") or "check_in",
            status=scan_data.get("status") or "success",
            rejection_reason=scan_data.get("rejection_reason"),
            admin_overridden_by=scan_data.get("admin_overridden_by"),
            created_at=parse_dt(scan_data.get("created_at")) or datetime.utcnow(),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "event_id": scan_data.get("event_id") or event_id,
                "participant_id": scan_data.get("participant_id"),
                "companion_id": scan_data.get("companion_id"),
                "checkin_gate_id": scan_data.get("checkin_gate_id"),
                "badge_id": scan_data.get("badge_id"),
                "station_name": scan_data.get("station_name") or scan_data.get("gate_name") or "Check-In Gate",
                "station_type": scan_data.get("station_type") or scan_data.get("gate_type") or "registration",
                "location": scan_data.get("location"),
                "badge_code": scan_data.get("badge_code") or "",
                "scan_type": scan_data.get("scan_type") or "check_in",
                "status": scan_data.get("status") or "success",
                "rejection_reason": scan_data.get("rejection_reason"),
                "admin_overridden_by": scan_data.get("admin_overridden_by"),
            },
        )
        await db.execute(scan_stmt)

    # 8. UPSERT kit inventory and participant kit issue rows.
    for kit_data in data.get("kits", []):
        kit_stmt = insert(Kit).values(
            id=kit_data["id"],
            kit_name=kit_data.get("kit_name") or "Event Kit",
            category=kit_data.get("category") or "Delegate",
            total_quantity=kit_data.get("total_quantity") or 0,
            distributed_quantity=kit_data.get("distributed_quantity") or 0,
            max_per_participant=kit_data.get("max_per_participant") or 1,
            description=kit_data.get("description"),
            target_roles=kit_data.get("target_roles") or ["All"],
            created_at=parse_dt(kit_data.get("created_at")) or datetime.utcnow(),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "kit_name": kit_data.get("kit_name") or "Event Kit",
                "category": kit_data.get("category") or "Delegate",
                "total_quantity": kit_data.get("total_quantity") or 0,
                "distributed_quantity": kit_data.get("distributed_quantity") or 0,
                "max_per_participant": kit_data.get("max_per_participant") or 1,
                "description": kit_data.get("description"),
                "target_roles": kit_data.get("target_roles") or ["All"],
            },
        )
        await db.execute(kit_stmt)

    for pk_data in data.get("participant_kits", []):
        pk_stmt = insert(ParticipantKit).values(
            id=pk_data["id"],
            participant_id=pk_data["participant_id"],
            kit_id=pk_data["kit_id"],
            status=pk_data.get("status") or "Issued",
            issued_by=pk_data.get("issued_by") or "SYNC",
            issued_at=parse_dt(pk_data.get("issued_at")) or datetime.utcnow(),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "participant_id": pk_data["participant_id"],
                "kit_id": pk_data["kit_id"],
                "status": pk_data.get("status") or "Issued",
                "issued_by": pk_data.get("issued_by") or "SYNC",
                "issued_at": parse_dt(pk_data.get("issued_at")) or datetime.utcnow(),
            },
        )
        await db.execute(pk_stmt)

    # 9. UPSERT action logs, devices, and workstation assignments.
    for action_data in data.get("participant_action_logs", []):
        action_stmt = insert(ParticipantActionLog).values(
            id=action_data["id"],
            participant_id=action_data["participant_id"],
            action_type=action_data.get("action_type") or "synced",
            performed_by=action_data.get("performed_by") or "SYNC",
            details=action_data.get("details"),
            created_at=parse_dt(action_data.get("created_at")) or datetime.utcnow(),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "action_type": action_data.get("action_type") or "synced",
                "performed_by": action_data.get("performed_by") or "SYNC",
                "details": action_data.get("details"),
            },
        )
        await db.execute(action_stmt)

    for device_data in data.get("room_devices", []):
        if not device_data.get("room_id"):
            continue
        device_stmt = insert(RoomDevice).values(
            id=device_data["id"],
            event_id=device_data.get("event_id") or event_id,
            room_id=device_data["room_id"],
            device_type=device_data.get("device_type") or "workstation",
            device_name=device_data.get("device_name") or "Workstation",
            hostname=device_data.get("hostname"),
            ip_address=device_data.get("ip_address"),
            mac_address=device_data.get("mac_address"),
            os_version=device_data.get("os_version"),
            app_version=device_data.get("app_version"),
            status=device_data.get("status") or "offline",
            last_heartbeat_at=parse_dt(device_data.get("last_heartbeat_at")),
            registered_at=parse_dt(device_data.get("registered_at")) or datetime.utcnow(),
            updated_at=parse_dt(device_data.get("updated_at")) or datetime.utcnow(),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "event_id": device_data.get("event_id") or event_id,
                "room_id": device_data["room_id"],
                "device_type": device_data.get("device_type") or "workstation",
                "device_name": device_data.get("device_name") or "Workstation",
                "hostname": device_data.get("hostname"),
                "ip_address": device_data.get("ip_address"),
                "mac_address": device_data.get("mac_address"),
                "os_version": device_data.get("os_version"),
                "app_version": device_data.get("app_version"),
                "status": device_data.get("status") or "offline",
                "last_heartbeat_at": parse_dt(device_data.get("last_heartbeat_at")),
                "updated_at": parse_dt(device_data.get("updated_at")) or datetime.utcnow(),
            },
        )
        await db.execute(device_stmt)

    for assignment_data in data.get("node_assignments", []):
        assignment_stmt = insert(VenueNodeAssignment).values(
            id=assignment_data["id"],
            event_id=assignment_data.get("event_id") or event_id,
            device_id=assignment_data["device_id"],
            mode=assignment_data.get("mode") or "registration",
            station_id=assignment_data.get("station_id"),
            checkin_gate_id=assignment_data.get("checkin_gate_id"),
            permissions=assignment_data.get("permissions") or {},
            status=assignment_data.get("status") or "pending",
            snapshot_version=assignment_data.get("snapshot_version") or 0,
            last_sync_at=parse_dt(assignment_data.get("last_sync_at")),
            last_heartbeat_at=parse_dt(assignment_data.get("last_heartbeat_at")),
            revoked_at=parse_dt(assignment_data.get("revoked_at")),
            revoked_reason=assignment_data.get("revoked_reason"),
            created_by=assignment_data.get("created_by"),
            created_at=parse_dt(assignment_data.get("created_at")) or datetime.utcnow(),
            updated_at=parse_dt(assignment_data.get("updated_at")) or datetime.utcnow(),
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "device_id": assignment_data["device_id"],
                "mode": assignment_data.get("mode") or "registration",
                "station_id": assignment_data.get("station_id"),
                "checkin_gate_id": assignment_data.get("checkin_gate_id"),
                "permissions": assignment_data.get("permissions") or {},
                "status": assignment_data.get("status") or "pending",
                "snapshot_version": assignment_data.get("snapshot_version") or 0,
                "last_sync_at": parse_dt(assignment_data.get("last_sync_at")),
                "last_heartbeat_at": parse_dt(assignment_data.get("last_heartbeat_at")),
                "revoked_at": parse_dt(assignment_data.get("revoked_at")),
                "revoked_reason": assignment_data.get("revoked_reason"),
                "updated_at": parse_dt(assignment_data.get("updated_at")) or datetime.utcnow(),
            },
        )
        await db.execute(assignment_stmt)
