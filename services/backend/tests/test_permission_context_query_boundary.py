from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_erp_permission_context_uses_one_joined_read():
    service = (ROOT / "app/modules/platform/permissions/service.py").read_text(encoding="utf-8")
    region = service.split("async def get_user_erp_context", 1)[1].split("async def check_user_permission", 1)[0]
    assert "PlatformRolePermission," in region
    assert "PlatformPermission," in region
    assert ".outerjoin(" in region
    assert "UserAssignment.organization_id == org_id" in region
    assert "self.repository.get_permissions_for_role" not in region
    assert "selectinload(UserAssignment.role)" not in region
