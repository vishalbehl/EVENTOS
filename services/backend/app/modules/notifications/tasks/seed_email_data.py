"""
seed_email_data.py
------------------
Reads HTML template files from  app/templates/*.html  and upserts them
into the email_templates table as global (event_id=NULL) system defaults.

Template file → DB mapping
  premium_ppt_instructions.html  → upload_invite
  premium_reminder.html          → reminder
  premium_welcome.html           → welcome / confirmation
  premium_approval.html          → approval
  premium_rejection.html         → rejection
  premium_promotional.html       → promotional
"""

import asyncio
from pathlib import Path

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.modules.communications.models.email_template import EmailTemplate

# ── Absolute path to the templates folder ─────────────────────────────────────
TEMPLATES_DIR = Path(__file__).resolve().parents[3] / "templates"

# ── Metadata for each template file ───────────────────────────────────────────
# Keys match the filename stem (without .html)
TEMPLATE_METADATA: dict[str, dict] = {
    "premium_ppt_instructions": {
        "name": "PPT / Talk Upload Instructions",
        "template_type": "upload_invite",
        "target_type": "speaker",
        "subject": "Action Required: Upload Your Presentation — {{EventName}}",
    },
    "premium_reminder": {
        "name": "Presentation Upload Reminder",
        "template_type": "reminder",
        "target_type": "speaker",
        "subject": "Reminder: Upload Deadline Approaching — {{EventName}}",
    },
    "premium_welcome": {
        "name": "Welcome & Registration Confirmation",
        "template_type": "welcome",
        "target_type": "attendee",
        "subject": "Welcome to {{EventName}} — Your Registration is Confirmed",
    },
    "premium_approval": {
        "name": "File Approved Notification",
        "template_type": "approval",
        "target_type": "speaker",
        "subject": "Your Presentation Has Been Approved — {{EventName}}",
    },
    "premium_rejection": {
        "name": "File Rejected Notification",
        "template_type": "rejection",
        "target_type": "speaker",
        "subject": "Action Needed: Presentation Rejected — {{EventName}}",
    },
    "premium_promotional": {
        "name": "Event Promotional / Announcement",
        "template_type": "promotional",
        "target_type": "attendee",
        "subject": "{{EventName}} — Don't Miss Out!",
    },
}


async def seed_templates() -> None:
    """
    Upsert all HTML templates from the app/templates/ directory into the DB.
    - If a template with the same name already exists → update its HTML + subject.
    - If it doesn't exist → insert it as a new system default.
    """
    if not TEMPLATES_DIR.exists():
        print(f"[seed_templates] WARNING: templates directory not found at {TEMPLATES_DIR}")
        return

    async with AsyncSessionLocal() as db:
        seeded = 0
        updated = 0

        for stem, meta in TEMPLATE_METADATA.items():
            html_path = TEMPLATES_DIR / f"{stem}.html"
            if not html_path.exists():
                print(f"[seed_templates] SKIP: {html_path.name} not found")
                continue

            body_html = html_path.read_text(encoding="utf-8")

            # Upsert: check by template name (unique across global templates)
            result = await db.execute(
                select(EmailTemplate).where(
                    EmailTemplate.name == meta["name"],
                    EmailTemplate.event_id.is_(None),  # only global templates
                )
            )
            existing = result.scalars().first()

            if existing:
                existing.subject = meta["subject"]
                existing.body_html = body_html
                updated += 1
                print(f"[seed_templates] Updated : {meta['name']}")
            else:
                tpl = EmailTemplate(
                    name=meta["name"],
                    template_type=meta["template_type"],
                    target_type=meta["target_type"],
                    subject=meta["subject"],
                    body_html=body_html,
                    body_text=None,
                    event_id=None,
                    is_default=True,
                )
                db.add(tpl)
                seeded += 1
                print(f"[seed_templates] Inserted: {meta['name']}")

        await db.commit()
        print(f"[seed_templates] Done — {seeded} inserted, {updated} updated.")


if __name__ == "__main__":
    asyncio.run(seed_templates())
