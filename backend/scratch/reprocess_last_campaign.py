import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal
from app.models.email_campaign import EmailCampaign
from app.models.email_log import EmailLog
from app.tasks.email_tasks import process_email_campaign
from sqlalchemy import select, delete, desc

async def run():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(EmailCampaign).order_by(desc(EmailCampaign.created_at)).limit(2))
        campaigns = res.scalars().all()
        if not campaigns:
            print("No campaigns found.")
            return
            
        for c in campaigns:
            # Delete any existing email logs for this campaign so the idempotency check is bypassed!
            await db.execute(delete(EmailLog).where(EmailLog.campaign_id == c.id))
            
            c.status = "draft"
            c.sent_count = 0
            await db.commit()
            print(f"Bypassed idempotency & queueing campaign: {c.id} ({c.name})")
            process_email_campaign.delay(str(c.id))

if __name__ == "__main__":
    asyncio.run(run())
