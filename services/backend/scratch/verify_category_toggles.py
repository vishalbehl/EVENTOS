# backend/scratch/verify_category_toggles.py
import asyncio
import sys
from pathlib import Path

# Add backend directory to python path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.database import AsyncSessionLocal
from app.modules.rbac.models.event import Event
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.routers.registration_portal import (
    get_public_registration_form,
    public_register_participant
)
from sqlalchemy import select

async def run_verification():
    print("Connecting to database...")
    async with AsyncSessionLocal() as db:
        # Get first event
        result = await db.execute(select(Event))
        event = result.scalars().first()
        if not event:
            print("No event found. Run ensure_admin_user or seed first.")
            return

        print(f"Using Event: {event.name} (ID: {event.id})")

        # Ensure roles are seeded
        roles_result = await db.execute(
            select(ParticipantRole).where(ParticipantRole.event_id == event.id)
        )
        roles = roles_result.scalars().all()
        if not roles:
            print("Seeding default roles...")
            from app.modules.registration.routers.participant_roles import seed_default_roles
            await seed_default_roles(event.id, db)
            roles_result = await db.execute(
                select(ParticipantRole).where(ParticipantRole.event_id == event.id)
            )
            roles = roles_result.scalars().all()

        print(f"Total roles configured in DB: {len(roles)}")
        
        # 1. Verify Organizer role category is "General Attendees"
        organizer_roles = [r for r in roles if r.name == "Organizer"]
        if not organizer_roles:
            print("[FAIL] Organizer role not found in database!")
        else:
            org_role = organizer_roles[0]
            print(f"Organizer Role Category in DB: '{org_role.category}'")
            if org_role.category == "General Attendees":
                print("[SUCCESS] Organizer category successfully updated in DB!")
            else:
                print("[FAIL] Organizer category mismatch in DB.")

        # 2. Test default public registration form options
        print("\n--- Testing Public Form Options (All Categories Enabled) ---")
        # Ensure disabled_categories is empty
        event.registration_settings = {**event.registration_settings, "disabled_categories": []}
        await db.commit()

        form_data = await get_public_registration_form(event_id=event.id, db=db)
        role_field = next((f for f in form_data["fields"] if f["id"] == "role"), None)
        if not role_field:
            print("[FAIL] 'role' field not found in form configuration!")
            return
        
        print("Active Roles returned on form:")
        print(role_field["options"])
        
        # Verify "Organizer" is in options
        if "Organizer" in role_field["options"]:
            print("[SUCCESS] 'Organizer' is available in options!")
        else:
            print("[FAIL] 'Organizer' is missing from options.")

        # Verify "Speaker" (Presentation Related) is in options
        if "Speaker" in role_field["options"]:
            print("[SUCCESS] 'Speaker' is available in options!")
        else:
            print("[FAIL] 'Speaker' is missing from options.")

        # 3. Disable "Presentation Related" category
        print("\n--- Disabling 'Presentation Related' Category ---")
        event.registration_settings = {
            **event.registration_settings,
            "disabled_categories": ["Presentation Related"]
        }
        await db.commit()

        form_data_disabled = await get_public_registration_form(event_id=event.id, db=db)
        role_field_disabled = next((f for f in form_data_disabled["fields"] if f["id"] == "role"), None)
        print("Active Roles returned on form after disabling 'Presentation Related':")
        print(role_field_disabled["options"])

        # "Speaker" should NOT be in options
        if "Speaker" not in role_field_disabled["options"]:
            print("[SUCCESS] 'Speaker' was successfully filtered out from options!")
        else:
            print("[FAIL] 'Speaker' is still present in options despite disabled category.")

        # "Organizer" should still be in options
        if "Organizer" in role_field_disabled["options"]:
            print("[SUCCESS] 'Organizer' is still available in options!")
        else:
            print("[FAIL] 'Organizer' was incorrectly filtered out.")

        # 4. Verify Validation on registration
        print("\n--- Testing Registration Validation ---")
        from app.modules.registration.models.registration_form_config import RegistrationFormConfig
        config_stmt = select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event.id)
        config_res = await db.execute(config_stmt)
        config = config_res.scalar_one_or_none()
        if not config:
            config = RegistrationFormConfig(event_id=event.id, is_live=True, fields=form_data_disabled["fields"])
            db.add(config)
        else:
            config.is_live = True
        await db.commit()

        # Try to register as a Speaker (which is disabled)
        reg_payload = {
            "name": "Jane Doe",
            "email": "jane.doe@example.com",
            "role": "Speaker"
        }
        try:
            await public_register_participant(event_id=event.id, payload=reg_payload, db=db)
            print("[FAIL] Registration succeeded unexpectedly for disabled role 'Speaker'!")
        except Exception as e:
            print(f"[SUCCESS] Registration failed as expected: {str(e)}")

        # Try to register as an Organizer (which is active)
        reg_payload_active = {
            "name": "Organizer Bob",
            "email": "bob.organizer@example.com",
            "role": "Organizer"
        }
        try:
            res = await public_register_participant(event_id=event.id, payload=reg_payload_active, db=db)
            print(f"[SUCCESS] Registration succeeded for active role 'Organizer': {res['regno']}")
        except Exception as e:
            print(f"[FAIL] Registration failed unexpectedly for active role 'Organizer': {str(e)}")

        # Clean up test settings
        event.registration_settings = {**event.registration_settings, "disabled_categories": []}
        await db.commit()
        print("\n--- Cleaned up settings. Verification complete. ---")

if __name__ == "__main__":
    asyncio.run(run_verification())
