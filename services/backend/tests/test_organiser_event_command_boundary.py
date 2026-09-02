from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/organiser/router.py"
SERVICE = ROOT / "app/modules/organiser/application/event_commands.py"


def test_event_duplicate_delegates_transaction_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def duplicate_organiser_event", 1)[1].split("@router.", 1)[0]
    assert "OrganizerEventCommandService(db).duplicate" in region
    assert "await db.commit()" not in region


def test_event_duplicate_command_is_tenant_locked_idempotent_audited_and_fail_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert "EventMutationService.create" in source
    assert ".with_for_update" in source
    assert "idempotency_key" in source and "EVENT_DUPLICATED" in source
    assert "AuditLog" in source and "invalidate_organization" in source
    assert "await self.db.rollback()" in source


def test_event_restore_route_delegates_transaction_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def restore_organiser_event", 1)[1].split("@router.", 1)[0]
    assert "OrganizerEventCommandService(db).restore" in region
    assert "await db.commit()" not in region
