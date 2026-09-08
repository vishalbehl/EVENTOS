from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/organiser/router.py"
SERVICE = ROOT / "app/modules/organiser/application/billing_commands.py"


def test_billing_profile_update_delegates_transaction_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def update_organiser_billing_profile", 1)[1].split("@router.get", 1)[0]
    assert "OrganizerBillingCommandService(db).update_profile" in region
    assert "await db.commit()" not in region


def test_billing_command_is_locked_versioned_audited_and_fail_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert "async def update_profile" in source
    assert ".with_for_update()" in source
    assert "VERSION_CONFLICT" in source
    assert "AuditLog" in source
    assert "invalidate_organization" in source
    assert "await self.db.rollback()" in source


def test_billing_command_persists_durable_replay_result():
    source = SERVICE.read_text(encoding="utf-8")
    assert "begin_idempotent" in source
    assert "complete_idempotent" in source
    assert 'operation="organiser.organization.billing.update"' in source
