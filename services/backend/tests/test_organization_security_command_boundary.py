from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/organization_console_router.py"
SERVICE = ROOT / "app/modules/platform/application/security_commands.py"


def test_platform_security_policy_delegates_transaction():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def update_security_policy", 1)[1].split("@router.", 1)[0]
    assert "OrganizationSecurityCommandService(db).update_policy" in region
    assert "await db.commit()" not in region


def test_platform_security_command_is_locked_versioned_audited_and_fail_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert ".with_for_update()" in source
    assert "HTTP_412_PRECONDITION_FAILED" in source
    assert "AuditLog" in source and "invalidate_organization" in source
    assert "await self.db.rollback()" in source


def test_trusted_device_revoke_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    service = SERVICE.read_text(encoding="utf-8")
    region = router.split("async def revoke_trusted_device", 1)[1].split("@router.", 1)[0]
    assert "OrganizationSecurityCommandService(db).revoke_trusted_device" in region
    assert "await db.commit()" not in region
    assert "async def revoke_trusted_device" in service


def test_session_revocation_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    service = SERVICE.read_text(encoding="utf-8")
    region = router.split("async def revoke_organization_sessions", 1)[1].split("@router.", 1)[0]
    assert "OrganizationSecurityCommandService(db).revoke_all_sessions" in region
    assert "await db.commit()" not in region
    assert "async def revoke_all_sessions" in service
