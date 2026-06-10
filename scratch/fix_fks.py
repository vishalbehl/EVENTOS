import os
import re
from pathlib import Path

BASE_DIR = Path("D:/DEV/conf-platform/services/backend/app")

# Mapping of old FK string (table.column) -> new FK string (schema.table.column)
FK_REPLACEMENTS = {
    # PLATFORM
    '"organizations.id"': '"platform.organizations.id"',
    "'organizations.id'": "'platform.organizations.id'",
    
    # IDENTITY
    '"users.id"': '"identity.users.id"',
    "'users.id'": "'identity.users.id'",
    
    # EVENTS
    '"events.id"': '"events.events.id"',
    "'events.id'": "'events.events.id'",
    '"rooms.id"': '"events.rooms.id"',
    "'rooms.id'": "'events.rooms.id'",
    '"sessions.id"': '"events.sessions.id"',
    "'sessions.id'": "'events.sessions.id'",
    '"speakers.id"': '"events.speakers.id"',
    "'speakers.id'": "'events.speakers.id'",
    '"session_speakers.id"': '"events.session_speakers.id"',
    "'session_speakers.id'": "'events.session_speakers.id'",
    
    # BILLING
    '"subscription_plans.id"': '"billing.subscription_plans.id"',
    '"addons.id"': '"billing.addons.id"',
    '"feature_catalog.id"': '"platform.feature_catalog.id"',
    
    # COMMUNICATIONS
    '"email_templates.id"': '"communications.email_templates.id"',
    '"email_campaigns.id"': '"communications.email_campaigns.id"',
    
    # VENUE
    '"presentation_queue.id"': '"venue.presentation_queue.id"',
    '"room_devices.id"': '"venue.room_devices.id"',
    '"srr_stations.id"': '"venue.srr_stations.id"',
    
    # PRESENTATIONS
    '"presentation_files.id"': '"presentations.presentation_files.id"',
    '"presentation_bundles.id"': '"presentations.presentation_bundles.id"',
    
    # REGISTRATION
    '"participants.id"': '"registration.participants.id"',
    '"participant_registrations.id"': '"registration.participant_registrations.id"',
    '"promo_codes.id"': '"registration.promo_codes.id"',
    '"participant_roles.id"': '"registration.participant_roles.id"',
    '"badges.id"': '"registration.badges.id"',
    '"printers.id"': '"registration.printers.id"',
    '"print_templates.id"': '"registration.print_templates.id"',
    
    # RBAC
    '"roles.id"': '"rbac.roles.id"',
    '"permissions.id"': '"rbac.permissions.id"',
    '"support_tickets.id"': '"audit.support_tickets.id"', # wait, previously I had support_tickets in rbac. The master plan moved it to audit! Let's check master plan. "rbac.support_tickets -> audit.support_tickets". Yes! But did my alembic script move it? Let's check.
}

def fix_fks():
    for root, _, files in os.walk(BASE_DIR):
        for file in files:
            if not file.endswith(".py"):
                continue
                
            file_path = Path(root) / file
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                original_content = content
                for old_fk, new_fk in FK_REPLACEMENTS.items():
                    content = content.replace(old_fk, new_fk)
                    
                if content != original_content:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f"Updated FKs in {file_path.relative_to(BASE_DIR)}")
            except Exception as e:
                print(f"Error processing {file_path}: {e}")

if __name__ == "__main__":
    print("Fixing FKs...")
    fix_fks()
    print("Done.")