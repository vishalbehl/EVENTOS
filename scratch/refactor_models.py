import os
import shutil
import re
from pathlib import Path

# Define the base directory for modules
BASE_DIR = Path("D:/DEV/conf-platform/services/backend/app/modules")

# Define the mapping from Old Path -> New Bounded Context and Schema
MODEL_MIGRATIONS = {
    # PLATFORM
    "rbac/models/organization.py": ("platform", "platform"),
    "rbac/models/system_setting.py": ("platform", "platform"),
    "rbac/models/subscription.py": ("billing", "billing"), # Moving most of this to billing, we'll split later if needed
    
    # IDENTITY
    "auth/models/user.py": ("identity", "identity"),
    "auth/models/refresh_token.py": ("identity", "identity"),
    "auth/models/security_event.py": ("identity", "identity"),
    "registration/models/portal_otp_token.py": ("identity", "identity"),
    
    # RBAC (Stays in rbac, but schema might change from rbac to rbac if not already)
    "rbac/models/rbac.py": ("rbac", "rbac"),
    "rbac/models/user_assignment.py": ("rbac", "rbac"),
    "rbac/models/organisation_member.py": ("rbac", "rbac"), # schema rbac
    "auth/models/user_organization_membership.py": ("rbac", "rbac"), # Wait, should this move? Master plan says: Unify. Let's move to rbac for now.
    
    # EVENTS
    "rbac/models/event.py": ("events", "events"),
    "venue/models/room.py": ("events", "events"),
    "venue/models/capacity_rule.py": ("events", "events"),
    "speakers/models/session.py": ("events", "events"),
    "speakers/models/speaker.py": ("events", "events"),
    "speakers/models/session_speaker.py": ("events", "events"),
    "speakers/models/speaker_profile.py": ("events", "events"),
    
    # PRESENTATIONS
    "presentations/models/presentation_file.py": ("presentations", "presentations"),
    "presentations/models/file_validation.py": ("presentations", "presentations"),
    "presentations/models/file_integrity_log.py": ("presentations", "presentations"),
    "presentations/models/presentation_bundle.py": ("presentations", "presentations"),
    "speakers/models/poster.py": ("presentations", "presentations"),
    
    # REGISTRATION
    "registration/models/participant.py": ("registration", "registration"),
    "registration/models/participant_role.py": ("registration", "registration"),
    "registration/models/participant_registration.py": ("registration", "registration"),
    "registration/models/ticket_type.py": ("registration", "registration"),
    "registration/models/promo_code.py": ("registration", "registration"),
    "registration/models/payment_transaction.py": ("registration", "registration"),
    "registration/models/registration_form_config.py": ("registration", "registration"),
    "registration/models/badge_models.py": ("registration", "registration"), # contains Badges, Printers, etc. Printers should go to venue eventually, but let's keep in registration for now
    "registration/models/print_template.py": ("registration", "registration"),
    
    # VENUE
    "venue/models/srr_station.py": ("venue", "venue"),
    "venue/models/srr_checkin.py": ("venue", "venue"),
    "venue/models/room_device.py": ("venue", "venue"),
    "presentations/models/presentation_queue.py": ("venue", "venue"),
    "presentations/models/playback_event.py": ("venue", "venue"),
    "venue/models/venue_sync_job.py": ("venue", "venue"),
    
    # COMMUNICATIONS
    "notifications/models/email_template.py": ("communications", "communications"),
    "notifications/models/email_campaign.py": ("communications", "communications"),
    "notifications/models/email_log.py": ("communications", "communications"),
    "notifications/models/announcement.py": ("communications", "communications"),
    
    # ANALYTICS
    "venue/models/attendance_log.py": ("analytics", "analytics"),
    
    # AUDIT
    # public.audit_logs is in app/models/audit_log.py
}

def create_module_structure():
    new_modules = ["platform", "identity", "billing", "rbac", "events", "registration", 
                   "presentations", "venue", "communications", "analytics", "audit", 
                   "integrations", "applications", "developer"]
    
    for mod in new_modules:
        mod_dir = BASE_DIR / mod
        models_dir = mod_dir / "models"
        models_dir.mkdir(parents=True, exist_ok=True)
        
        # Create __init__.py files
        (mod_dir / "__init__.py").touch(exist_ok=True)
        (models_dir / "__init__.py").touch(exist_ok=True)
        
def migrate_models():
    for old_rel_path, (new_module, new_schema) in MODEL_MIGRATIONS.items():
        old_path = BASE_DIR / old_rel_path
        if not old_path.exists():
            print(f"WARN: Could not find {old_path}")
            continue
            
        file_name = old_path.name
        new_path = BASE_DIR / new_module / "models" / file_name
        
        # Move file
        print(f"Moving {old_rel_path} -> {new_module}/models/{file_name}")
        shutil.move(str(old_path), str(new_path))
        
        # Update __table_args__ schema
        with open(new_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Regex to find __table_args__ = {"schema": "old_schema"}
        content = re.sub(r'__table_args__\s*=\s*\{[\'"]schema[\'"]\s*:\s*[\'"][^\'"]+[\'"]\}', 
                         f'__table_args__ = {{"schema": "{new_schema}"}}', content)
                         
        with open(new_path, 'w', encoding='utf-8') as f:
            f.write(content)

if __name__ == "__main__":
    print("Starting Model Migration...")
    create_module_structure()
    migrate_models()
    print("Done.")
