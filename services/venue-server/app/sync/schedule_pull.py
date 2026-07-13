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
from app.models.capacity_rule import CapacityRule
from app.models.badge_models import Badge
from app.websocket.connection import broadcast_queue_update

async def pull_event_queue(event_id: str):
    """
    Pulls the latest queue and schedule state from the Cloud API.
    Uses PostgreSQL UPSERT to robustly sync the state into the local database.
    """
    logger.info(f"[Sync] Pulling latest queue for event {event_id} from cloud...")
    
    url = f"{settings.CLOUD_API_URL}/api/v1/sync/events/{event_id}/queue"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url, 
                headers={"X-Device-Key": settings.CLOUD_DEVICE_KEY},
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()
            
            async with AsyncSessionLocal() as db:
                await _upsert_schedule_data(db, data)
                await db.commit()
            
            logger.info(f"[Sync] Queue sync complete for {event_id}.")
            
            # Broadcast WebSocket event to let Technician app know to refresh
            await broadcast_queue_update(event_id)
            
    except Exception as e:
        logger.error(f"[Sync] Failed to pull queue from cloud: {e}")

async def _upsert_schedule_data(db: AsyncSession, data: dict):
    """
    Physically writes the JSON schedule data into PostgreSQL using UPSERTs.
    """
    event_id = data["event_id"]

    # 1. UPSERT print_templates
    for t_data in data.get("print_templates", []):
        t_stmt = insert(PrintTemplate).values(
            id=t_data["id"],
            event_id=event_id,
            template_name=t_data["template_name"],
            template_type=t_data.get("template_type", "custom"),
            template_data=t_data.get("template_data", {}),
            updated_at=t_data.get("updated_at")
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "template_name": t_data["template_name"],
                "template_type": t_data.get("template_type", "custom"),
                "template_data": t_data.get("template_data", {}),
                "updated_at": t_data.get("updated_at")
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
            registered_at=p_data.get("registered_at")
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
                "registered_at": p_data.get("registered_at")
            }
        )
        await db.execute(p_stmt)

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
            issued_at=b_data.get("issued_at"),
            created_at=b_data.get("created_at"),
            updated_at=b_data.get("updated_at")
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "badge_code": b_data["badge_code"],
                "qr_token": b_data["qr_token"],
                "barcode": b_data["barcode"],
                "nfc_uid": b_data.get("nfc_uid"),
                "template_id": b_data.get("template_id"),
                "status": b_data.get("status", "created"),
                "issued_at": b_data.get("issued_at"),
                "created_at": b_data.get("created_at"),
                "updated_at": b_data.get("updated_at")
            }
        )
        await db.execute(b_stmt)

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
            start_time=sess_data.get("start_time"),
            end_time=sess_data.get("end_time"),
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
                # Upsert Speaker
                sp_stmt = insert(Speaker).values(
                    id=sp_data["speaker_id"],
                    event_id=event_id,
                    first_name=sp_data["first_name"],
                    last_name=sp_data["last_name"]
                ).on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "first_name": sp_data["first_name"],
                        "last_name": sp_data["last_name"]
                    }
                )
                await db.execute(sp_stmt)

            # Upsert PresentationFile if exists
            if sp_data.get("file_id"):
                pf_stmt = insert(PresentationFile).values(
                    id=sp_data["file_id"],
                    event_id=event_id,
                    speaker_id=sp_data.get("speaker_id"),
                    storage_path=sp_data["storage_path"],
                    file_format=sp_data["file_format"],
                    upload_status=sp_data.get("upload_status", "approved")
                ).on_conflict_do_nothing()
                await db.execute(pf_stmt)

            # Upsert SessionSpeaker
            if sp_data.get("speaker_id"):
                ss_stmt = insert(SessionSpeaker).values(
                    session_id=sess_data["id"],
                    speaker_id=sp_data["speaker_id"],
                    talk_order=sp_data["talk_order"],
                    presentation_title=sp_data.get("presentation_title"),
                    talk_duration_minutes=sp_data.get("talk_duration_minutes") or sp_data.get("duration_minutes"),
                    presentation_file_id=sp_data.get("file_id")
                ).on_conflict_do_update(
                    constraint="uq_session_speaker",
                    set_={
                        "talk_order": sp_data["talk_order"],
                        "presentation_title": sp_data.get("presentation_title"),
                        "talk_duration_minutes": sp_data.get("talk_duration_minutes") or sp_data.get("duration_minutes"),
                        "presentation_file_id": sp_data.get("file_id")
                    }
                )
                await db.execute(ss_stmt)

    # 6. UPSERT capacity_rules
    for r_data in data.get("capacity_rules", []):
        r_stmt = insert(CapacityRule).values(
            id=r_data["id"],
            event_id=event_id,
            session_id=r_data.get("session_id"),
            room_id=r_data.get("room_id"),
            capacity=r_data["capacity"],
            waitlist_enabled=r_data.get("waitlist_enabled", True),
            auto_promote=r_data.get("auto_promote", True),
            priority_enabled=r_data.get("priority_enabled", False)
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "capacity": r_data["capacity"],
                "waitlist_enabled": r_data.get("waitlist_enabled", True),
                "auto_promote": r_data.get("auto_promote", True),
                "priority_enabled": r_data.get("priority_enabled", False)
            }
        )
        await db.execute(r_stmt)
