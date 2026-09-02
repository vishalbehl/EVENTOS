"""Guardrails for the serialized venue attendance mutation boundary."""

import inspect


def test_attendance_router_delegates_mutations_to_command_service():
    from app.modules.venue.routers import attendance

    checkin_source = inspect.getsource(attendance.check_in_participant)
    checkout_source = inspect.getsource(attendance.check_out_participant)

    assert "AttendanceCommandService(db).check_in" in checkin_source
    assert "AttendanceCommandService(db).check_out" in checkout_source
    assert "await db.commit()" not in checkin_source
    assert "await db.commit()" not in checkout_source


def test_attendance_commands_own_transaction_and_serialization_contract():
    from app.modules.venue.application.commands import AttendanceCommandService

    checkin_source = inspect.getsource(AttendanceCommandService.check_in)
    checkout_source = inspect.getsource(AttendanceCommandService.check_out)

    for source in (checkin_source, checkout_source):
        assert "CheckInService.acquire_mutation" in source
        assert "await self.db.commit()" in source
        assert "await self.db.rollback()" in source
        assert "with_for_update()" in source


def test_attendance_commands_keep_tenant_and_event_scope():
    from app.modules.venue.application.commands import AttendanceCommandService

    source = inspect.getsource(AttendanceCommandService)
    assert "event.organization_id" in source
    assert "event.id" in source
    assert "participant.event_id == event_id" in source

