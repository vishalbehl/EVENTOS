import os
from pathlib import Path

BASE_DIR = Path("D:/DEV/conf-platform")

# Mapping of old import path -> new import path
IMPORT_REPLACEMENTS = {
    # PLATFORM
    "app.modules.rbac.models.organization": "app.modules.platform.models.organization",
    "app.modules.rbac.models.system_setting": "app.modules.platform.models.system_setting",
    "app.modules.rbac.models.subscription": "app.modules.billing.models.subscription",
    
    # IDENTITY
    "app.modules.auth.models.user": "app.modules.identity.models.user",
    "app.modules.auth.models.refresh_token": "app.modules.identity.models.refresh_token",
    "app.modules.auth.models.security_event": "app.modules.identity.models.security_event",
    "app.modules.registration.models.portal_otp_token": "app.modules.identity.models.portal_otp_token",
    
    # RBAC
    "app.modules.auth.models.user_organization_membership": "app.modules.rbac.models.user_organization_membership",
    
    # EVENTS
    "app.modules.rbac.models.event": "app.modules.events.models.event",
    "app.modules.venue.models.room": "app.modules.events.models.room",
    "app.modules.venue.models.capacity_rule": "app.modules.events.models.capacity_rule",
    "app.modules.speakers.models.session": "app.modules.events.models.session",
    "app.modules.speakers.models.speaker": "app.modules.events.models.speaker",
    "app.modules.speakers.models.session_speaker": "app.modules.events.models.session_speaker",
    "app.modules.speakers.models.speaker_profile": "app.modules.events.models.speaker_profile",
    
    # PRESENTATIONS
    "app.modules.speakers.models.poster": "app.modules.presentations.models.poster",
    
    # VENUE
    "app.modules.presentations.models.presentation_queue": "app.modules.venue.models.presentation_queue",
    "app.modules.presentations.models.playback_event": "app.modules.venue.models.playback_event",
    
    # COMMUNICATIONS
    "app.modules.notifications.models.email_template": "app.modules.communications.models.email_template",
    "app.modules.notifications.models.email_campaign": "app.modules.communications.models.email_campaign",
    "app.modules.notifications.models.email_log": "app.modules.communications.models.email_log",
    "app.modules.notifications.models.announcement": "app.modules.communications.models.announcement",
    
    # ANALYTICS
    "app.modules.venue.models.attendance_log": "app.modules.analytics.models.attendance_log",
}

def fix_imports():
    for root, dirs, files in os.walk(BASE_DIR):
        # Exclude directories
        dirs[:] = [d for d in dirs if d not in ('.venv', 'node_modules', '.git', '__pycache__', 'scratch')]
        
        for file in files:
            if not file.endswith(".py"):
                continue
                
            file_path = Path(root) / file
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                original_content = content
                for old_import, new_import in IMPORT_REPLACEMENTS.items():
                    content = content.replace(old_import, new_import)
                    
                if content != original_content:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f"Updated imports in {file_path.relative_to(BASE_DIR)}")
            except Exception as e:
                pass

if __name__ == "__main__":
    print("Fixing imports...")
    fix_imports()
    print("Done.")