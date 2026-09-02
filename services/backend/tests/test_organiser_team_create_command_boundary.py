from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/organiser/router.py"
SERVICE = ROOT / "app/modules/platform/application/organization_team_commands.py"


def test_organiser_team_create_delegates_idempotent_transaction():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def create_organiser_team", 1)[1].split("@router.", 1)[0]
    assert "OrganizationTeamCommandService(db).create" in region
    assert "idempotency_key=idempotency_key" in region
    assert "await db.commit()" not in region


def test_team_create_command_replays_and_invalidates_after_commit():
    source = SERVICE.read_text(encoding="utf-8")
    assert "idempotency_key" in source
    assert "ORGANIZATION_TEAM_CREATED" in source
    assert "await invalidate_organization(organization_id)" in source
    assert "await self.db.rollback()" in source


def test_organiser_team_update_and_archive_delegate_transactions():
    source = ROUTER.read_text(encoding="utf-8")
    update_region = source.split("async def update_organiser_team", 1)[1].split("@router.", 1)[0]
    archive_region = source.split("async def delete_organiser_team", 1)[1].split("@router.", 1)[0]
    assert "OrganizationTeamCommandService(db).update" in update_region
    assert "OrganizationTeamCommandService(db).archive" in archive_region
    assert "await db.commit()" not in update_region
    assert "await db.commit()" not in archive_region
