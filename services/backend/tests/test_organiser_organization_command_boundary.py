from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/organiser/router.py"
SERVICE = ROOT / "app/modules/organiser/application/organization_commands.py"


def test_profile_update_delegates_transaction_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def update_organiser_profile", 1)[1].split("def _custom_field_out", 1)[0]
    assert "OrganizerOrganizationCommandService(db).update_profile" in region
    assert "await db.commit()" not in region


def test_profile_command_is_locked_versioned_audited_and_rollback_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert "async def update_profile" in source
    assert ".with_for_update()" in source
    assert "VERSION_CONFLICT" in source
    assert "AuditLog" in source
    assert "invalidate_organization" in source
    assert "await self.db.rollback()" in source


def test_profile_command_persists_durable_replay_result():
    source = SERVICE.read_text(encoding="utf-8")
    assert "begin_idempotent" in source
    assert "complete_idempotent" in source
    assert 'operation="organiser.organization.profile.update"' in source
    assert '"if_match": if_match' in source
