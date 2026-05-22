# scratch_test_promote.py
import asyncio
import traceback
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.modules.rbac.models.event import Event
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.venue.models.capacity_rule import CapacityRule
from app.modules.auth.models.user import User
from app.modules.venue.routers.capacity import trigger_waitlist_promotions

class MockUser:
    def __init__(self, id):
        self.id = id

async def main():
    async with AsyncSessionLocal() as db:
        # Get first event
        event_res = await db.execute(select(Event).limit(1))
        event = event_res.scalar_one_or_none()
        if not event:
            print("No event found in DB!")
            return
        
        # Get first user
        user_res = await db.execute(select(User).limit(1))
        user = user_res.scalar_one_or_none()
        if not user:
            print("No user found in DB!")
            return

        print(f"Testing waitlist promotion for event: {event.id} ({event.title})")
        print(f"Using user: {user.email} ({user.id})")

        # Let's count waitlisted registrations
        wl_res = await db.execute(
            select(ParticipantRegistration)
            .where(
                ParticipantRegistration.event_id == event.id,
                ParticipantRegistration.registration_status == "waitlisted"
            )
        )
        wl_regs = wl_res.scalars().all()
        print(f"Waitlist count before promotion: {len(wl_regs)}")

        try:
            # Let's call trigger_waitlist_promotions
            res = await trigger_waitlist_promotions(event=event, current_user=user, db=db)
            print(f"Successfully ran promotion. Promoted: {len(res)} participants.")
        except Exception as e:
            print("Exception occurred during promotion:")
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
