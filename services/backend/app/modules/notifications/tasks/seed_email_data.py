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
# Populate SQLAlchemy's shared mapper registry before EmailTemplate is queried.
# This keeps the seeder valid both during application startup and when invoked
# directly as an operational repair command.
import app.models  # noqa: F401
from app.modules.communications.models.email_template import EmailTemplate
from app.modules.communications.models.email_template_version import EmailTemplateVersion


def _waypoint_document(meta: dict) -> dict:
    """Editable first-party defaults; legacy HTML remains the send snapshot until publish."""
    heading_id = f"heading-{meta['stable_key']}"
    text_id = f"text-{meta['stable_key']}"
    return {
        "root": {
            "type": "EmailLayout",
            "data": {
                "backdropColor": "#edf0f4",
                "canvasColor": "#ffffff",
                "textColor": "#172033",
                "fontFamily": "MODERN_SANS",
                "childrenIds": [heading_id, text_id],
            },
        },
        heading_id: {
            "type": "Heading",
            "data": {"style": {"padding": {"top": 28, "right": 32, "bottom": 8, "left": 32}}, "props": {"text": meta["heading"], "level": "h2"}},
        },
        text_id: {
            "type": "Text",
            "data": {"style": {"padding": {"top": 8, "right": 32, "bottom": 28, "left": 32}}, "props": {"text": meta["copy"]}},
        },
    }

# ── Absolute path to the templates folder ─────────────────────────────────────
TEMPLATES_DIR = Path(__file__).resolve().parents[3] / "templates"

# ── Metadata for each template file ───────────────────────────────────────────
# Keys match the filename stem (without .html)
TEMPLATE_METADATA: dict[str, dict] = {
    "premium_ppt_instructions": {
        "stable_key": "speaker-upload-invite",
        "heading": "Your presentation upload",
        "copy": "Hello {{SpeakerName}}, upload your presentation for {{EventName}} using {{UploadLink}}.",
        "name": "PPT / Talk Upload Instructions",
        "template_type": "upload_invite",
        "target_type": "speaker",
        "subject": "Action Required: Upload Your Presentation — {{EventName}}",
    },
    "premium_reminder": {
        "stable_key": "speaker-upload-reminder",
        "heading": "Presentation upload reminder",
        "copy": "Hello {{SpeakerName}}, this is a reminder about your presentation for {{EventName}}.",
        "name": "Presentation Upload Reminder",
        "template_type": "reminder",
        "target_type": "speaker",
        "subject": "Reminder: Upload Deadline Approaching — {{EventName}}",
    },
    "premium_welcome": {
        "stable_key": "registration-confirmation",
        "heading": "You are registered",
        "copy": "Your registration for {{EventName}} is confirmed.",
        "name": "Welcome & Registration Confirmation",
        "template_type": "welcome",
        "target_type": "attendee",
        "subject": "Welcome to {{EventName}} — Your Registration is Confirmed",
    },
    "premium_approval": {
        "stable_key": "speaker-file-approved",
        "heading": "Your presentation is approved",
        "copy": "Hello {{SpeakerName}}, your presentation for {{EventName}} has been approved.",
        "name": "File Approved Notification",
        "template_type": "approval",
        "target_type": "speaker",
        "subject": "Your Presentation Has Been Approved — {{EventName}}",
    },
    "premium_rejection": {
        "stable_key": "speaker-file-rejected",
        "heading": "Your presentation needs changes",
        "copy": "Hello {{SpeakerName}}, your presentation for {{EventName}} needs changes.",
        "name": "File Rejected Notification",
        "template_type": "rejection",
        "target_type": "speaker",
        "subject": "Action Needed: Presentation Rejected — {{EventName}}",
    },
    "premium_promotional": {
        "stable_key": "general-announcement",
        "heading": "An update from {{EventName}}",
        "copy": "Here is the latest news from {{EventName}}.",
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
                # Published templates are immutable. The studio owns future
                # changes; seeding only repairs missing editable source.
                if not existing.designer_json:
                    existing.designer_json = _waypoint_document(meta)
                    updated += 1
                    print(f"[seed_templates] Added editable source: {meta['name']}")
            else:
                tpl = EmailTemplate(
                    name=meta["name"],
                    template_type=meta["template_type"],
                    target_type=meta["target_type"],
                    subject=meta["subject"],
                    body_html=body_html,
                    body_text=None,
                    event_id=None,
                    organization_id=None,
                    scope_type="PLATFORM",
                    stable_key=meta["stable_key"],
                    designer_json=_waypoint_document(meta),
                    is_default=True,
                )
                db.add(tpl)
                await db.flush()
                version = EmailTemplateVersion(
                    template_id=tpl.id,
                    version_number=1,
                    lifecycle_state="PUBLISHED",
                    subject=tpl.subject,
                    body_html=tpl.body_html,
                    body_text=tpl.body_text,
                    designer_json=tpl.designer_json,
                    editor_schema_version=1,
                    published_at=tpl.created_at,
                )
                db.add(version)
                await db.flush()
                tpl.current_published_version_id = version.id
                seeded += 1
                print(f"[seed_templates] Inserted: {meta['name']}")

        await db.commit()
        print(f"[seed_templates] Done — {seeded} inserted, {updated} updated.")


if __name__ == "__main__":
    asyncio.run(seed_templates())
