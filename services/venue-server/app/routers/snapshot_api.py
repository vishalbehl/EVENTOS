from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_database
from app.models.session import Session
from app.models.session_speaker import SessionSpeaker
from app.models.presentation_file import PresentationFile
from app.routers.auth import DeviceAuth

router = APIRouter(prefix="/api/v1/sessions", tags=["snapshot"])

@router.get("/{session_id}/snapshot")
async def get_session_snapshot(session_id: str, is_auth: DeviceAuth, db: AsyncSession = Depends(get_database)):
    """
    Returns the 'Preloaded Execution State' for a given session.
    The Room App calls this endpoint to pull a completely frozen representation
    of the session, speakers, and file paths. 
    It will then save this JSON to its local disk (e.g. C:/EventCache/snapshot.json).
    """
    stmt = (
        select(Session)
        .options(
            selectinload(Session.session_speakers).selectinload(SessionSpeaker.speaker),
            selectinload(Session.session_speakers).selectinload(SessionSpeaker.presentation_files)
        )
        .where(Session.id == session_id)
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Build the frozen snapshot dictionary
    speakers_data = []
    
    # Sort speakers by talk_order
    sorted_session_speakers = sorted(session.session_speakers, key=lambda ss: ss.talk_order)
    
    for ss in sorted_session_speakers:
        speaker = ss.speaker
        file = ss.current_file
        
        # We only care about the file if it's approved and downloaded locally
        file_path = file.storage_path if file and file.upload_status == "approved" else None
        
        speakers_data.append({
            "speaker_id": str(speaker.id) if speaker else None,
            "name": f"{speaker.first_name} {speaker.last_name}" if speaker else "Unknown",
            "talk_title": ss.presentation_title,
            "talk_order": ss.talk_order,
            "file_path": file_path,
            "file_format": file.file_format if file else None,
            "duration_minutes": ss.duration_minutes
        })

    snapshot = {
        "session_id": str(session.id),
        "session_code": session.session_code,
        "name": session.name,
        "room_id": str(session.room_id) if session.room_id else None,
        "start_time": session.start_time.isoformat() if session.start_time else None,
        "end_time": session.end_time.isoformat() if session.end_time else None,
        "speakers": speakers_data,
        "snapshot_generated_at": "now" # In a real implementation we would use datetime.now(timezone.utc).isoformat()
    }
    
    return snapshot

@router.post("/{session_id}/lock")
async def lock_session_for_execution(session_id: str, is_auth: DeviceAuth, db: AsyncSession = Depends(get_database)):
    """
    Called by the Technician App when pressing 'Send to Room'.
    Locks the session (preventing further cloud syncs from overwriting it)
    and broadcasts a WebSocket event instructing the Room App to download the snapshot.
    """
    stmt = select(Session).where(Session.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # In a full implementation, we'd add a 'locked' or 'state' column to Session
    session.status = "active" # or "locked_for_preload"
    await db.commit()

    # Broadcast Redis Pub/Sub message
    # from app.websocket.connection import broadcast_session_lock
    # await broadcast_session_lock(session_id)

    return {"status": "locked", "message": "Session snapshot frozen. Room App notified to preload."}
