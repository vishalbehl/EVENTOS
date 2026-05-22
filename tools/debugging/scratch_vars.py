import asyncio
import re
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.modules.notifications.models.email_template import EmailTemplate

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(EmailTemplate).where(EmailTemplate.id == "e44bc9c8-3398-4add-855d-d4d5afc87e4e")
        )
        t = res.scalar_one_or_none()
        if t:
            placeholders = re.findall(r"\{\{(.+?)\}\}", t.body_html)
            print("Placeholders found in template:", set(placeholders))
            # Let's print around the RejectionReason / RejectedPresentationTable parts
            lines = t.body_html.split("\n")
            for idx, line in enumerate(lines):
                if any(x in line for x in ["Rejection", "Reject", "Reason", "Table"]):
                    print(f"Line {idx+1}: {line.strip()}")

if __name__ == '__main__':
    asyncio.run(main())
