from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/router.py"
SERVICE = ROOT / "app/modules/platform/application/organization_commands.py"


def test_status_mutation_delegates_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def update_organization_status", 1)[1].split("@router.get", 1)[0]
    assert "OrganizationCommandService(db).update_status" in region
    assert "await db.commit()" not in region


def test_status_command_owns_lock_subscription_update_audit_and_rollback():
    source = SERVICE.read_text(encoding="utf-8")
    method = source.split("async def update_status", 1)[1].split("async def add_domain", 1)[0]
    assert ".with_for_update()" in method
    assert "OrganizationSubscription" in method
    assert "ActivityTimeline" in method
    assert "AuditLog" in source
    assert "await self.db.commit()" in method
    assert "await self.db.rollback()" in method
