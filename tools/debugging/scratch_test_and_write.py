# scratch_test_and_write.py
import asyncio
import traceback
import sys
import os

# Write a confirmation file immediately on import/execution
CONFIRM_PATH = "d:/DEV/conf-platform/backend/scratch_started.txt"
with open(CONFIRM_PATH, "w") as f:
    f.write("Script started execution at module level\n")

async def run_test():
    log_path = "d:/DEV/conf-platform/backend/scratch_run_log.txt"
    with open(log_path, "w") as f:
        # Redirect stdout and stderr to the log file
        sys.stdout = f
        sys.stderr = f
        
        print("Starting test...")
        try:
            from sqlalchemy import select
            from app.database import AsyncSessionLocal
            from app.modules.rbac.models.event import Event
            from app.modules.registration.models.participant_registration import ParticipantRegistration
            from app.modules.auth.models.user import User
            from app.modules.venue.routers.capacity import trigger_waitlist_promotions

            print("Imports successful, connecting to DB...")
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

                print(f"Testing waitlist promotion for event: {event.id} ({event.name})")
                print(f"Using user: {user.email} ({user.id})")

                # Count waitlisted registrations
                wl_res = await db.execute(
                    select(ParticipantRegistration)
                    .where(
                        ParticipantRegistration.event_id == event.id,
                        ParticipantRegistration.registration_status == "waitlisted"
                    )
                )
                wl_regs = wl_res.scalars().all()
                print(f"Waitlist count before promotion: {len(wl_regs)}")

                # Call trigger_waitlist_promotions
                res = await trigger_waitlist_promotions(event=event, current_user=user, db=db)
                print(f"Successfully ran promotion. Promoted: {len(res)} participants.")
        except Exception as e:
            print("Exception occurred:")
            traceback.print_exc()
        finally:
            print("Test finished.")

if __name__ == "__main__":
    asyncio.run(run_test())
