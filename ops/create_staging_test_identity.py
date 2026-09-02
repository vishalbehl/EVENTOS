"""Create the isolated local upload-test identity and event."""
import asyncio
import os
import uuid
from datetime import date
from sqlalchemy import select
import app.models  # register all ORM mappings before mapper configuration
from app.database import AsyncSessionLocal
from app.modules.events.models.event import Event
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.identity.models.user import User
from app.modules.identity.services.auth_service import hash_password
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import EventCommercialContract
from app.modules.registration.models.registration_form_config import RegistrationFormConfig

async def main() -> None:
    email = os.environ.get("STAGING_TEST_EMAIL", "").strip().lower()
    password = os.environ.get("STAGING_TEST_PASSWORD", "")
    if not email or len(password) < 16:
        raise RuntimeError("STAGING_TEST_EMAIL and a 16+ character STAGING_TEST_PASSWORD are required")
    async with AsyncSessionLocal() as db:
        org = await db.scalar(select(Organization).where(Organization.slug == "local-production-test"))
        if org is None:
            org = Organization(name="Local Production Test", slug="local-production-test", is_active=True)
            db.add(org)
            await db.flush()
        user = await db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(organization_id=org.id, email=email, password_hash=hash_password(password), first_name="Staging", last_name="Tester", role="organiser", is_active=True, is_2fa_enabled=False)
            db.add(user)
            await db.flush()
        else:
            user.organization_id = org.id
            user.is_active = True
            user.is_2fa_enabled = False
            user.password_hash = hash_password(password)
        member = await db.scalar(select(OrganizationMember).where(OrganizationMember.organization_id == org.id, OrganizationMember.user_id == user.id))
        if member is None:
            db.add(OrganizationMember(organization_id=org.id, user_id=user.id, org_role="owner", is_active=True))
        event = await db.scalar(select(Event).where(Event.short_code == "LUPLOAD"))
        if event is None:
            event = Event(organization_id=org.id, created_by=user.id, name="Local Upload Validation", short_code="LUPLOAD", start_date=date.today(), end_date=date.today(), status="active")
            db.add(event)
        else:
            event.organization_id = org.id
            event.created_by = user.id
            event.status = "active"
        form = await db.scalar(select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event.id))
        if form is None:
            db.add(RegistrationFormConfig(event_id=event.id, is_live=True, fields=[]))
        else:
            form.is_live = True
        contract = await db.scalar(select(EventCommercialContract).where(
            EventCommercialContract.organization_id == org.id,
            EventCommercialContract.event_id == event.id,
            EventCommercialContract.status == "ACTIVE",
        ).order_by(EventCommercialContract.version.desc()))
        if contract is None:
            registration_entitlements = {
                "FEAT_REGISTRATION_PORTAL": "ADVANCED",
                "FEAT_REGISTRATION_FORMS": "CUSTOM",
                "FEAT_TICKET_CATEGORIES": True,
                "FEAT_COUPON_CODES": True,
                "FEAT_PAYMENT_GATEWAY": True,
                "FEAT_QR_CONFIRMATION": True,
            }
            db.add(EventCommercialContract(
                organization_id=org.id,
                event_id=event.id,
                version=1,
                status="ACTIVE",
                plan_key="LOCAL_STAGING_REGISTRATION",
                plan_version="1",
                currency="INR",
                entitlements=registration_entitlements,
                hard_ceilings={},
                addons=[],
                source={"source_type": "LOCAL_STAGING_SEED"},
                created_by=user.id,
            ))
        await db.commit()
        print(f"event_id={event.id}")
        print(f"organization_id={org.id}")

if __name__ == "__main__":
    asyncio.run(main())
