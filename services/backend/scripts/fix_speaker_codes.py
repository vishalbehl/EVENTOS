
import asyncio
import uuid
from app.database import AsyncSessionLocal
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.event import Event
from sqlalchemy import select, update
from app.services import qr_service
from loguru import logger

async def fix_missing_codes_and_qrs():
    async with AsyncSessionLocal() as db:
        # Find all speakers where speaker_code is NULL or qr_code_url is NULL
        result = await db.execute(
            select(Speaker, Event)
            .join(Event, Event.id == Speaker.event_id)
            .where(
                (Speaker.speaker_code == None) | 
                (Speaker.speaker_code == "") | 
                (Speaker.qr_code_url == None)
            )
        )
        rows = result.all()
        
        print(f"Found {len(rows)} speakers needing repair (Missing Code or QR).")
        
        for speaker, event in rows:
            needs_save = False
            
            # 1. Fix Access Code
            if not speaker.speaker_code:
                if speaker.upload_token:
                    code = speaker.upload_token[:8].upper()
                else:
                    code = str(uuid.uuid4()).split("-")[0].upper()
                speaker.speaker_code = code
                print(f"[{speaker.email}] Assigned code: {code}")
                needs_save = True
            
            # 2. Fix QR Code
            if not speaker.qr_code_url:
                print(f"[{speaker.email}] Generating QR for {speaker.full_name}...")
                try:
                    qr_url = qr_service.generate_and_upload_speaker_qr(
                        speaker.id, speaker.full_name, event.name, speaker.speaker_code
                    )
                    speaker.qr_code_url = qr_url
                    needs_save = True
                    print(f"[{speaker.email}] QR Generated: {qr_url}")
                except Exception as e:
                    print(f"[{speaker.email}] Failed to generate QR: {e}")
            
            if needs_save:
                await db.flush()
        
        await db.commit()
        print("Successfully updated missing codes and QRs.")

if __name__ == "__main__":
    asyncio.run(fix_missing_codes_and_qrs())
