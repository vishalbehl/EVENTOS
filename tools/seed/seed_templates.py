import os
import uuid
from sqlalchemy import select
from app.database import SessionLocal, engine
from app.modules.communications.models.email_template import EmailTemplate

# Load premium templates
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PREMIUM_APPROVAL_PATH = os.path.join(BASE_DIR, "app", "templates", "premium_approval.html")
PREMIUM_REJECTION_PATH = os.path.join(BASE_DIR, "app", "templates", "premium_rejection.html")
PREMIUM_WELCOME_PATH = os.path.join(BASE_DIR, "app", "templates", "premium_welcome.html")
PREMIUM_PROMOTIONAL_PATH = os.path.join(BASE_DIR, "app", "templates", "premium_promotional.html")
PREMIUM_REMINDER_PATH = os.path.join(BASE_DIR, "app", "templates", "premium_reminder.html")
PREMIUM_PPT_INSTRUCTIONS_PATH = os.path.join(BASE_DIR, "app", "templates", "premium_ppt_instructions.html")

def load_template_html(path, fallback):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return fallback

DEFAULT_TEMPLATES = [
    {
        "name": "PPT / Talk Upload Instructions",
        "template_type": "guidelines",
        "subject": "Presentation Upload Guidelines — {{EventName}}",
        "body_html": load_template_html(
            PREMIUM_PPT_INSTRUCTIONS_PATH,
            """
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #eee; border-radius: 20px;">
                <h2 style="color: #7747ff;">Eventos IT Speaker Guide</h2>
                <p>Please upload your presentation files for <strong>{{EventName}}</strong>.</p>
                <div style="margin: 40px 0; text-align: center;">
                    <a href="{{UploadLink}}" style="background: #7747ff; color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: bold;">Upload Now</a>
                </div>
            </div>
            """
        ),
        "is_default": True
    },
    {
        "name": "Speaker Welcome & Upload Link",
        "template_type": "upload_invite",
        "subject": "Invitation to Upload your Presentation for {{EventName}}",
        "body_html": load_template_html(
            PREMIUM_WELCOME_PATH,
            """
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #eee; border-radius: 20px;">
                <h2 style="color: #7747ff;">Welcome to EventOS IT</h2>
                <p>Please upload your files using the link below:</p>
                <div style="margin: 40px 0; text-align: center;">
                    <a href="{{UploadLink}}" style="background: #7747ff; color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: bold;">Upload Files Now</a>
                </div>
            </div>
            """
        ),
        "is_default": True
    },
    {
        "name": "Upload Reminder",
        "template_type": "reminder",
        "subject": "Reminder - Upload your presentation for {{EventName}}",
        "body_html": load_template_html(
            PREMIUM_REMINDER_PATH,
            """
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #eee; border-radius: 20px;">
                <h2 style="color: #f59e0b; font-size: 24px; font-weight: 800; margin-bottom: 20px;">Just a Reminder</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #374151;">Hi <strong>{{SpeakerName}}</strong>,</p>
                <p style="font-size: 16px; line-height: 1.6; color: #374151;">We noticed that you haven't uploaded your presentation files for <strong>{{EventName}}</strong> yet.</p>
                <p style="font-size: 16px; line-height: 1.6; color: #374151;">To access the speaker kiosks on-site, please use your unique Access Code: <strong>{{AccessCode}}</strong></p>
                <p style="font-size: 16px; line-height: 1.6; color: #374151; font-weight: bold; color: #dc2626;">Please upload them as soon as possible so we can prepare for your session.</p>
                <div style="margin: 40px 0; text-align: center;">
                    <a href="{{UploadLink}}" style="background: #f59e0b; color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">Upload Files Now</a>
                </div>
                <p style="font-size: 14px; color: #374151;">If you have any questions, just reply to this email.</p>
            </div>
            """
        ),
        "is_default": True
    },
    {
        "name": "Files Approved",
        "template_type": "approval",
        "subject": "Your files have been approved for {{EventName}}",
        "body_html": load_template_html(
            PREMIUM_APPROVAL_PATH,
            """
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #eee; border-radius: 20px;">
                <h2 style="color: #10b981; font-size: 24px; font-weight: 800; margin-bottom: 20px;">Great News!</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #374151;">Hi <strong>{{SpeakerName}}</strong>,</p>
                <p style="font-size: 16px; line-height: 1.6; color: #374151;">Your presentation files for <strong>{{EventName}}</strong> have been reviewed and approved.</p>
                <p style="font-size: 16px; line-height: 1.6; color: #374151;">Everything is ready for your session: <strong>{{SessionName}}</strong> in <strong>{{RoomName}}</strong>.</p>
                <div style="margin: 40px 0; padding: 20px; background: #f0fdf4; border-radius: 12px; border: 1px solid #10b981;">
                    <p style="font-size: 14px; color: #065f46; margin: 0; font-weight: bold;">Status: All Set!</p>
                </div>
                <p style="font-size: 14px; color: #374151;">We look forward to seeing you at the event.</p>
            </div>
            """
        ),
        "is_default": True
    },
    {
        "name": "Re-upload Required",
        "template_type": "rejection",
        "subject": "Action Required: Please update your files for {{EventName}}",
        "body_html": load_template_html(
            PREMIUM_REJECTION_PATH,
            """
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #eee; border-radius: 20px;">
                <h2 style="color: #ef4444; font-size: 24px; font-weight: 800; margin-bottom: 20px;">Update Needed</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #374151;">Hi <strong>{{SpeakerName}}</strong>,</p>
                <p style="font-size: 16px; line-height: 1.6; color: #374151;">We reviewed your files for <strong>{{EventName}}</strong> and found a few things that need to be changed.</p>
                <div style="margin: 24px 0; padding: 24px; background: #fef2f2; border-radius: 12px; border: 1px solid #ef4444;">
                    <p style="font-size: 14px; color: #991b1b; margin: 0; font-weight: bold; margin-bottom: 8px;">Reason for change:</p>
                    <p style="font-size: 14px; color: #374151; margin: 0;">{{RejectedReason}}</p>
                </div>
                <p style="font-size: 16px; line-height: 1.6; color: #374151;">Please upload the updated files using the link below:</p>
                <div style="margin: 40px 0; text-align: center;">
                    <a href="{{UploadLink}}" style="background: #ef4444; color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">Upload Corrected Files</a>
                </div>
            </div>
            """
        ),
        "is_default": True
    },
    {
        "name": "Promotional",
        "template_type": "promotion",
        "subject": "The Future of Conference Operations Starts Here — EventOS IT",
        "body_html": load_template_html(
            PREMIUM_PROMOTIONAL_PATH,
            """
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #eee; border-radius: 20px;">
                <h2 style="color: #7747ff;">The Future of Conference Operations Starts Here</h2>
                <p>Welcome to EventOS IT!</p>
            </div>
            """
        ),
        "is_default": True
    }
]

def seed_templates():
    with SessionLocal() as db:
        for t_data in DEFAULT_TEMPLATES:
            # Check if exists (by name and global status)
            stmt = select(EmailTemplate).where(
                EmailTemplate.name == t_data["name"],
                EmailTemplate.event_id.is_(None)
            )
            existing = db.execute(stmt).scalar_one_or_none()
            
            if existing:
                existing.subject = t_data["subject"]
                existing.body_html = t_data["body_html"]
                existing.template_type = t_data["template_type"]
                existing.is_default = t_data["is_default"]
                print(f"Updated existing template: {t_data['name']}")
            else:
                template = EmailTemplate(
                    event_id=None,
                    name=t_data["name"],
                    template_type=t_data["template_type"],
                    subject=t_data["subject"],
                    body_html=t_data["body_html"],
                    is_default=t_data["is_default"]
                )
                db.add(template)
                print(f"Seeding new template: {t_data['name']}")
        
        db.commit()
        print("Template seeding protocol complete.")

if __name__ == "__main__":
    seed_templates()
