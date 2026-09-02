# tests/test_participant_update.py
from __future__ import annotations

import pytest
import pytest_asyncio
import uuid
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.schemas.participant import ParticipantUpdate
from app.modules.registration.routers.participants import update_participant, create_participant, generate_next_regno
from app.modules.registration.schemas.participant import ParticipantCreate
from app.modules.registration.application.commands import ParticipantCommandService
from app.modules.platform.models.idempotency import IdempotencyRecord
from sqlalchemy import func, select
from tests.conftest import activate_event_for_test


@pytest_asyncio.fixture(autouse=True)
async def licensed_event(db: AsyncSession, event: Event):
    await activate_event_for_test(db, event)


@pytest.mark.asyncio
async def test_participant_regno_update_on_role_change(
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    # 1. Seed ParticipantRoles for the event
    role_del = ParticipantRole(
        event_id=event.id,
        category="General",
        name="Delegate",
        role_code="DEL",
        is_active=True,
        is_default=True
    )
    role_vip = ParticipantRole(
        event_id=event.id,
        category="VIP",
        name="VIP Delegate",
        role_code="VIP",
        is_active=True,
        is_default=False
    )
    role_del_alias = ParticipantRole(
        event_id=event.id,
        category="General",
        name="Regular Delegate",
        role_code="DEL",
        is_active=True,
        is_default=False
    )
    db.add_all([role_del, role_vip, role_del_alias])
    await db.commit()

    # 2. Create a Participant with role "Delegate"
    p1_create = ParticipantCreate(
        name="John Doe",
        email="johndoe@example.com",
        role="Delegate",
        paid_status="Unpaid"
    )
    p1 = await create_participant(payload=p1_create, event=event, idempotency_key=f"test-{uuid.uuid4()}", current_user=organizer, db=db)
    assert p1.regno == "DEL-0001"

    # 3. Update Participant's name, regno should remain DEL-0001
    p1_update_name = ParticipantUpdate(name="John Updated")
    res_name = await update_participant(participant_id=p1.id, payload=p1_update_name, event=event, current_user=organizer, db=db)
    assert res_name.name == "John Updated"
    assert res_name.regno == "DEL-0001"

    # 4. Update Participant's role to "Regular Delegate" (same prefix "DEL")
    # regno should remain DEL-0001 because the prefix is the same
    p1_update_same_prefix = ParticipantUpdate(role="Regular Delegate")
    res_same = await update_participant(participant_id=p1.id, payload=p1_update_same_prefix, event=event, current_user=organizer, db=db)
    assert res_same.role == "Regular Delegate"
    assert res_same.regno == "DEL-0001"

    # 5. Update Participant's role to "VIP Delegate" (different prefix "VIP")
    # regno should update to VIP-0001
    p1_update_diff_prefix = ParticipantUpdate(role="VIP Delegate")
    res_diff = await update_participant(participant_id=p1.id, payload=p1_update_diff_prefix, event=event, current_user=organizer, db=db)
    assert res_diff.role == "VIP Delegate"
    assert res_diff.regno == "VIP-0001"

    p2_create = ParticipantCreate(
        name="Jane Smith",
        email="janesmith@example.com",
        role="Delegate",
        paid_status="Unpaid"
    )
    p2 = await create_participant(payload=p2_create, event=event, idempotency_key=f"test-{uuid.uuid4()}", current_user=organizer, db=db)
    assert p2.regno == "DEL-0001"


@pytest.mark.asyncio
async def test_participant_create_replays_idempotently(
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    payload = ParticipantCreate(
        name="Replay Participant",
        email="replay@example.com",
        role="Delegate",
        paid_status="Unpaid",
    )
    key = f"participant-replay-{uuid.uuid4()}"

    first, _, first_outcome = await ParticipantCommandService.create(
        db,
        event=event,
        payload=payload,
        actor_user_id=organizer.id,
        idempotency_key=key,
        source="test",
    )
    second, _, second_outcome = await ParticipantCommandService.create(
        db,
        event=event,
        payload=payload,
        actor_user_id=organizer.id,
        idempotency_key=key,
        source="test",
    )

    assert first.id == second.id
    assert first_outcome == "CREATED"
    assert second_outcome == "REPLAYED"
    assert await db.scalar(
        select(func.count(Participant.id)).where(Participant.event_id == event.id)
    ) == 1
    assert await db.scalar(
        select(IdempotencyRecord.status).where(
            IdempotencyRecord.organization_id == event.organization_id,
            IdempotencyRecord.operation == "registration.participant.create",
            IdempotencyRecord.idempotency_key == key,
        )
    ) == "COMPLETED"


@pytest.mark.asyncio
async def test_participant_update_replays_idempotently(
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    created, _, _ = await ParticipantCommandService.create(
        db,
        event=event,
        payload=ParticipantCreate(
            name="Update Replay Participant",
            email="update-replay@example.com",
            role="Delegate",
            paid_status="Unpaid",
        ),
        actor_user_id=organizer.id,
        idempotency_key=f"participant-create-{uuid.uuid4()}",
        source="test",
    )
    key = f"participant-update-{uuid.uuid4()}"
    payload = ParticipantUpdate(name="Updated Once")
    initial_version = created.version
    organization_id = event.organization_id

    first, _, _, _ = await ParticipantCommandService.update(
        db,
        event=event,
        participant_id=created.id,
        payload=payload,
        actor_user_id=organizer.id,
        expected_version=initial_version,
        idempotency_key=key,
    )
    second, _, _, _ = await ParticipantCommandService.update(
        db,
        event=event,
        participant_id=created.id,
        payload=payload,
        actor_user_id=organizer.id,
        expected_version=initial_version,
        idempotency_key=key,
    )

    assert first.id == second.id
    assert second.name == "Updated Once"
    with pytest.raises(HTTPException) as conflict:
        await ParticipantCommandService.update(
            db,
            event=event,
            participant_id=created.id,
            payload=ParticipantUpdate(name="Different Payload"),
            actor_user_id=organizer.id,
            expected_version=initial_version,
            idempotency_key=key,
        )
    assert getattr(conflict.value, "status_code", None) == 409
    assert conflict.value.detail["code"] == "IDEMPOTENCY_CONFLICT"
    assert await db.scalar(
        select(func.count(IdempotencyRecord.id)).where(
            IdempotencyRecord.organization_id == organization_id,
            IdempotencyRecord.operation == "registration.participant.update",
            IdempotencyRecord.idempotency_key == key,
            IdempotencyRecord.status == "COMPLETED",
        )
    ) == 1


@pytest.mark.asyncio
async def test_participant_first_last_name_split_and_merge(
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    # Seed roles needed
    role_del = ParticipantRole(
        event_id=event.id,
        category="General",
        name="Delegate",
        role_code="DEL",
        is_active=True,
        is_default=True
    )
    db.add(role_del)
    await db.commit()

    # 1. Create with first_name and last_name
    p_create1 = ParticipantCreate(
        first_name="Asha",
        last_name="Mehta",
        email="asha@example.com",
        role="Delegate",
        paid_status="Unpaid"
    )
    p1 = await create_participant(payload=p_create1, event=event, idempotency_key=f"test-{uuid.uuid4()}", current_user=organizer, db=db)
    assert p1.first_name == "Asha"
    assert p1.last_name == "Mehta"
    assert p1.name == "Asha Mehta"

    # 2. Create with name only (splitting)
    p_create2 = ParticipantCreate(
        name="Vikram Singh",
        email="vikram@example.com",
        role="Delegate",
        paid_status="Unpaid"
    )
    p2 = await create_participant(payload=p_create2, event=event, idempotency_key=f"test-{uuid.uuid4()}", current_user=organizer, db=db)
    assert p2.first_name == "Vikram"
    assert p2.last_name == "Singh"
    assert p2.name == "Vikram Singh"

    # 3. Create with single name (no space)
    p_create3 = ParticipantCreate(
        name="Madonna",
        email="madonna@example.com",
        role="Delegate",
        paid_status="Unpaid"
    )
    p3 = await create_participant(payload=p_create3, event=event, idempotency_key=f"test-{uuid.uuid4()}", current_user=organizer, db=db)
    assert p3.first_name == "Madonna"
    assert p3.last_name == ""
    assert p3.name == "Madonna"

    # 4. Update name only
    p1_update = ParticipantUpdate(name="Asha Sen")
    p1_res = await update_participant(participant_id=p1.id, payload=p1_update, event=event, current_user=organizer, db=db)
    assert p1_res.name == "Asha Sen"
    assert p1_res.first_name == "Asha"
    assert p1_res.last_name == "Sen"

    # 5. Update first_name only
    p2_update = ParticipantUpdate(first_name="Aditya")
    p2_res = await update_participant(participant_id=p2.id, payload=p2_update, event=event, current_user=organizer, db=db)
    assert p2_res.first_name == "Aditya"
    assert p2_res.last_name == "Singh"
    assert p2_res.name == "Aditya Singh"


from app.modules.registration.schemas.print_template import PrintTemplateCreate, PrintTemplateUpdate
from app.modules.registration.routers.print_templates import create_print_template, update_print_template

@pytest.mark.asyncio
async def test_print_template_type(
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    # 1. Create print template with template_type = badge
    pt_create = PrintTemplateCreate(
        template_name="Badge Template",
        template_type="badge",
        template_data={"test": "data"}
    )
    pt = await create_print_template(payload=pt_create, event=event, actor=organizer, idempotency_key=f"test-{uuid.uuid4()}", db=db)
    assert pt.template_name == "Badge Template"
    assert pt.template_type == "badge"
    assert pt.template_data == {"test": "data"}

    # 2. Update print template type
    pt_update = PrintTemplateUpdate(
        template_type="certificate"
    )
    pt_res = await update_print_template(template_id=pt.id, payload=pt_update, event=event, actor=organizer, idempotency_key=f"test-{uuid.uuid4()}", db=db)
    assert pt_res.template_type == "certificate"

