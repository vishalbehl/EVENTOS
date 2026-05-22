# backend/scratch/verify_registration_db_flow.py
import asyncio
import uuid
import sys
from pathlib import Path

# Add backend directory to python path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.database import AsyncSessionLocal
from app.modules.rbac.models.event import Event
from app.modules.auth.models.user import User
from app.modules.rbac.models.organization import Organization
from app.modules.registration.schemas.registration_form_config import RegistrationFormConfigUpdate, FormFieldConfig
from app.modules.registration.routers.registration_portal import (
    get_registration_form_config,
    update_registration_form_config,
    get_public_registration_form,
    public_register_participant
)
from sqlalchemy import select

async def run_verification():
    print("Connecting to database...")
    async with AsyncSessionLocal() as db:
        # 1. Verify/Create Organization and Admin
        result = await db.execute(select(Organization))
        org = result.scalar_one_or_none()
        if not org:
            print("Creating organization...")
            org = Organization(id=uuid.uuid4(), name="Verification Org", slug="verify-org")
            db.add(org)
            await db.flush()
        
        result = await db.execute(select(User).where(User.role == "super_admin"))
        user = result.scalars().first()
        if not user:
            print("Creating admin user...")
            from app.modules.auth.services.auth_service import hash_password
            user = User(
                id=uuid.uuid4(),
                organization_id=org.id,
                email="admin@eventos.com",
                password_hash=hash_password("admin123"),
                first_name="Admin",
                last_name="Verification",
                role="super_admin",
                is_active=True
            )
            db.add(user)
            await db.flush()
        
        # 2. Verify/Create Event
        result = await db.execute(select(Event))
        event = result.scalars().first()
        if not event:
            print("Creating default verification event...")
            event = Event(
                id=uuid.uuid4(),
                organization_id=org.id,
                name="Future Tech Summit 2026",
                short_code="FTS26",
                theme_color="#6366f1",
                event_mode=False,
                license_tier="pro",
                status="draft"
            )
            db.add(event)
            await db.flush()
        
        print(f"Using Event: {event.name} (ID: {event.id})")
        
        # 3. Retrieve default form configuration
        print("Getting default registration form config...")
        config = await get_registration_form_config(event=event, db=db)
        print(f"Default config is_live: {config.is_live}")
        print(f"Fields configured: {[f['id'] for f in config.fields]}")
        
        # 4. Make the portal live and configure custom fields
        print("Updating config to live with custom fields...")
        fields = [
            FormFieldConfig(
                id="name",
                name="name",
                label="Full Name",
                type="text",
                is_default=True,
                is_required=True,
                is_active=True
            ),
            FormFieldConfig(
                id="email",
                name="email",
                label="Email Address",
                type="text",
                is_default=True,
                is_required=True,
                is_active=True
            ),
            FormFieldConfig(
                id="food_pref",
                name="food_pref",
                label="Dietary Prefs",
                type="select",
                is_default=False,
                is_required=True,
                is_active=True,
                options=["Vegan", "Vegetarian", "Non-Veg", "Gluten-Free"]
            ),
            FormFieldConfig(
                id="upload_id",
                name="upload_id",
                label="Passport / ID Copy",
                type="file",
                is_default=False,
                is_required=False,
                is_active=True
            )
        ]
        update_payload = RegistrationFormConfigUpdate(
            is_live=True,
            fields=fields
        )
        updated_config = await update_registration_form_config(payload=update_payload, event=event, db=db)
        print(f"Updated config is_live: {updated_config.is_live}")
        
        # 5. Fetch public form details
        print("Fetching public form data...")
        public_form = await get_public_registration_form(event_id=event.id, db=db)
        print(f"Public form status: {'LIVE' if public_form['is_live'] else 'CLOSED'}")
        
        # 6. Perform a test registration
        print("Registering a test delegate...")
        reg_payload = {
            "name": "Alex Mercer",
            "email": "alex.mercer@example.com",
            "role": "Delegate",
            "food_pref": "Vegan",
            "upload_id": "https://s3.example.com/uploads/passport.pdf"
        }
        res = await public_register_participant(event_id=event.id, payload=reg_payload, db=db)
        print("Registration response:")
        print(res)
        
        # Commit to save
        await db.commit()
        print("Database transaction committed successfully!")

if __name__ == "__main__":
    asyncio.run(run_verification())
