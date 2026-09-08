from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/organiser/router.py"
SERVICE = ROOT / "app/modules/organiser/application/location_commands.py"


def test_location_routes_delegate_transaction_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    create_region = source.split("async def create_organiser_location", 1)[1].split("@router.", 1)[0]
    update_region = source.split("async def update_organiser_location", 1)[1].split("@router.", 1)[0]
    assert "OrganizerLocationCommandService(db).create" in create_region
    assert "OrganizerLocationCommandService(db).update" in update_region
    assert "await db.commit()" not in create_region
    assert "await db.commit()" not in update_region


def test_location_commands_validate_references_and_are_versioned_audited_and_fail_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert "async def create" in source and "async def update" in source
    assert ".with_for_update()" in source
    assert "LOCATION_NAME_EXISTS" in source
    assert "VERSION_CONFLICT" in source
    assert "BRANCH_OWNER_NOT_ACTIVE_MEMBER" in source
    assert "BRANCH_TEAM_NOT_ACTIVE" in source
    assert "AuditLog" in source and "invalidate_organization" in source
    assert "await self.db.rollback()" in source


def test_location_commands_persist_durable_replay_results():
    source = SERVICE.read_text(encoding="utf-8")
    assert source.count("begin_idempotent") >= 2
    assert source.count("complete_idempotent") >= 2
