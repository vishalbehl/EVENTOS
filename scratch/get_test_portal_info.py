import sys
import os

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "backend")))

import app.models # Register all models in SQLAlchemy
from app.database import SessionLocal
from app.modules.rbac.models.event import Event
from app.modules.registration.models.registration_theme_setting import RegistrationThemeSetting
from app.modules.speakers.models.speaker_theme_setting import SpeakerThemeSetting
from app.services.template_defaults import (
    get_default_registration_terms,
    get_default_registration_faqs,
    get_default_speaker_terms,
    get_default_speaker_faqs
)
from sqlalchemy import select

def main():
    db = SessionLocal()
    try:
        events = db.execute(select(Event)).scalars().all()
        print(f"Updating {len(events)} events in the database...")
        for event in events:
            # Registration Theme Settings
            if not event.registration_theme_setting:
                event.registration_theme_setting = RegistrationThemeSetting()
                db.add(event.registration_theme_setting)
            
            event.registration_theme_setting.terms_and_conditions = get_default_registration_terms()
            event.registration_theme_setting.faqs = get_default_registration_faqs()
            
            # Speaker Theme Settings
            if not event.speaker_theme_setting:
                event.speaker_theme_setting = SpeakerThemeSetting()
                db.add(event.speaker_theme_setting)
                
            event.speaker_theme_setting.terms_and_conditions = get_default_speaker_terms()
            event.speaker_theme_setting.faqs = get_default_speaker_faqs()
            
            print(f"Updated Event: {event.name} ({event.id})")
        db.commit()
        print("Database sync completed successfully.")
    except Exception as e:
        db.rollback()
        print(f"Error syncing database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
