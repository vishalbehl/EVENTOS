import asyncio
import uuid
from sqlalchemy import select, delete
from fastapi import HTTPException

# Import all models to configure SQLAlchemy registry
import app.models
from app.modules.rbac.models.event import Event
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.venue.models.capacity_rule import CapacityRule
from app.modules.registration.schemas.participant import ParticipantCreate
from app.modules.registration.services.portal_service import (
    verify_and_resolve_registration,
)
from app.modules.registration.routers.participants import insert_participants
from app.database import AsyncSessionLocal


async def run_tests():
    print("Starting duplicate prevention, merging, and capacity tests...")
    async with AsyncSessionLocal() as db:
        # 1. Fetch an event
        res = await db.execute(select(Event).limit(1))
        event = res.scalar_one_or_none()
        if not event:
            print("Error: No events found in the database. Please seed first.")
            return
        print(f"Using event: {event.name} ({event.id})")

        # 2. Cleanup existing test participants/registrations
        print("Cleaning up existing test data...")
        await db.execute(
            delete(ParticipantRegistration).where(ParticipantRegistration.event_id == event.id)
        )
        await db.execute(
            delete(Participant).where(
                Participant.event_id == event.id,
                Participant.name.like("Test %")
            )
        )
        await db.execute(
            delete(CapacityRule).where(
                CapacityRule.event_id == event.id,
                CapacityRule.session_id.is_(None),
                CapacityRule.room_id.is_(None)
            )
        )
        await db.commit()

        # 3. Test duplicate email registration check
        print("\n--- Test 1: Add new participant ---")
        p1 = Participant(
            event_id=event.id,
            regno="TST-0001",
            name="Test User One",
            email="test_one@example.com",
            phone="+91 99999 88888",
            role="Delegate",
            paid_status="Unpaid",
            source="test"
        )
        db.add(p1)
        await db.commit()
        print("Test User One added successfully.")

        print("\n--- Test 2: Duplicate email check (Expect 400) ---")
        try:
            await verify_and_resolve_registration(
                db=db,
                event_id=event.id,
                email="test_one@example.com",
                name="Test User One",
                phone="+91 99999 88888",
                confirm_merge=False
            )
            print("FAILED: Allowed duplicate email.")
        except HTTPException as e:
            if e.status_code == 400:
                print("PASSED: Correctly caught duplicate email (400 Bad Request).")
            else:
                print(f"FAILED: Unexpected status code {e.status_code}")

        print("\n--- Test 3: Name + Phone match, same details, different email, confirm_merge=False (Expect 409) ---")
        try:
            await verify_and_resolve_registration(
                db=db,
                event_id=event.id,
                email="test_one_alt@example.com",
                name="Test User One",
                phone="+91 99999 88888",
                confirm_merge=False
            )
            print("FAILED: Allowed registration with matching name+phone without warning.")
        except HTTPException as e:
            if e.status_code == 409:
                print("PASSED: Caught duplicate Name/Phone and returned 409 Conflict.")
                print(f"Conflict detail: {e.detail}")
            else:
                print(f"FAILED: Unexpected status code {e.status_code}")

        print("\n--- Test 4: Name + Phone match, same details, different email, confirm_merge=True (Expect Merge Success) ---")
        merged = await verify_and_resolve_registration(
            db=db,
            event_id=event.id,
            email="test_one_alt@example.com",
            name="Test User One",
            phone="+91 99999 88888",
            confirm_merge=True
        )
        if merged:
            print("PASSED: Merged email into existing profile.")
            additional = merged.custom_fields.get("additional_emails", [])
            print(f"Additional emails: {additional}")
            assert "test_one_alt@example.com" in additional
        else:
            print("FAILED: verify_and_resolve_registration returned None for merge.")

        print("\n--- Test 5: Verify find_by_email works for both primary and merged secondary emails ---")
        p_primary = await Participant.find_by_email(db, event.id, "test_one@example.com")
        p_secondary = await Participant.find_by_email(db, event.id, "test_one_alt@example.com")
        assert p_primary is not None
        assert p_secondary is not None
        assert p_primary.id == p_secondary.id
        print("PASSED: find_by_email successfully resolves both email inputs to the correct attendee.")

        # 4. Test Excel capacity sorting and waitlisting
        print("\n--- Test 6: Capacity Limit & Sorting Import Test ---")
        # Configure capacity to 2 (Since Test User One is already registered, 1 slot remains)
        cap_rule = CapacityRule(
            event_id=event.id,
            capacity=2,
            waitlist_enabled=True
        )
        db.add(cap_rule)
        await db.commit()

        # Prepare 4 imports
        import_payload = [
            ParticipantCreate(name="Test Unpaid A", email="test_unpaid_a@example.com", phone="1111", paid_status="Unpaid", role="Delegate"),
            ParticipantCreate(name="Test Paid B", email="test_paid_b@example.com", phone="2222", paid_status="Paid", role="Delegate"),
            ParticipantCreate(name="Test Unpaid C", email="test_unpaid_c@example.com", phone="3333", paid_status="Unpaid", role="Delegate"),
            ParticipantCreate(name="Test Paid D", email="test_paid_d@example.com", phone="4444", paid_status="Paid", role="Delegate"),
        ]

        # Call insert_participants
        inserted, waitlisted, merged_c = await insert_participants(
            db=db,
            event_id=event.id,
            payload=import_payload,
            default_source="excel_import"
        )
        print(f"Insert output: {inserted} active, {waitlisted} waitlisted, {merged_c} merged.")
        # Total capacity is 2. Test User One takes 1. 1 slot remains.
        # Sorted order of imports should put Paid first:
        # 1. Test Paid B (Paid) -> Fits! (slots_remaining=1 -> 0)
        # 2. Test Paid D (Paid) -> Overflows! -> Waitlisted
        # 3. Test Unpaid A (Unpaid) -> Overflows! -> Waitlisted
        # 4. Test Unpaid C (Unpaid) -> Overflows! -> Waitlisted
        assert inserted == 1
        assert waitlisted == 3
        print("PASSED: Successfully added 1 active and waitlisted 3.")

        # Let's verify waitlisted statuses and positions in db
        res_wl = await db.execute(
            select(ParticipantRegistration)
            .where(ParticipantRegistration.event_id == event.id)
            .order_by(ParticipantRegistration.waitlist_position.asc())
        )
        wl_regs = res_wl.scalars().all()
        print("Waitlisted queue:")
        for w in wl_regs:
            print(f" - Pos {w.waitlist_position}: {w.registration_data.get('name')} (Status: {w.registration_status}, Paid: {w.registration_data.get('paid_status')})")

        # Check order in waitlist
        # Position 1: Test Paid D (Since it was the second Paid in sorted order)
        # Position 2: Test Unpaid A (First Unpaid in FIFO order)
        # Position 3: Test Unpaid C (Second Unpaid in FIFO order)
        assert wl_regs[0].registration_data.get('name') == "Test Paid D"
        assert wl_regs[1].registration_data.get('name') == "Test Unpaid A"
        assert wl_regs[2].registration_data.get('name') == "Test Unpaid C"
        print("PASSED: Waitlist ordering matches expected priority (Paid first, then FIFO for unpaid).")

        # Cleanup test data
        print("\nCleaning up test records...")
        await db.execute(
            delete(ParticipantRegistration).where(ParticipantRegistration.event_id == event.id)
        )
        await db.execute(
            delete(Participant).where(
                Participant.event_id == event.id,
                Participant.name.like("Test %")
            )
        )
        await db.execute(
            delete(CapacityRule).where(
                CapacityRule.event_id == event.id,
                CapacityRule.session_id.is_(None),
                CapacityRule.room_id.is_(None)
            )
        )
        await db.commit()
        print("All tests completed successfully!")


if __name__ == "__main__":
    asyncio.run(run_tests())
