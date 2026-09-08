from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_team_list_and_detail_use_batched_tenant_safe_projection():
    router = (ROOT / "app/modules/platform/teams/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/teams/application/queries.py").read_text(encoding="utf-8")

    list_region = router.split("async def list_teams", 1)[1].split("@router.", 1)[0]
    detail_region = router.split("async def get_team", 1)[1].split("@router.", 1)[0]
    assert "TeamQueryService(service.db).list_with_counts" in list_region
    assert "TeamQueryService(service.db).get_with_count" in detail_region
    assert "member_count_stmt" not in router
    assert "Team.organization_id == org_id" in queries
    assert "TeamMember.deleted_at.is_(None)" in queries
    assert "func.count(TeamMember.id)" in queries
    assert ".limit(bounded_limit)" in queries
    assert "await self.db.commit()" not in queries


def test_team_member_identity_uses_tenant_safe_query_service():
    router = (ROOT / "app/modules/platform/teams/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/teams/application/queries.py").read_text(encoding="utf-8")

    member_region = router.split("async def add_team_member", 1)[1].split("@router.", 1)[0]
    assert "TeamQueryService(service.db).get_member_user" in member_region
    assert "await service.db.get" not in member_region
    assert "User.organization_id == organization_id" in queries
    assert "User.deleted_at.is_(None)" in queries

    repository = (ROOT / "app/modules/platform/teams/repository.py").read_text(encoding="utf-8")
    service = (ROOT / "app/modules/platform/teams/service.py").read_text(encoding="utf-8")
    assert "Team.organization_id == org_id" in repository
    assert "User.organization_id == org_id" in repository
    assert "get_user_for_organization(org_id, user_id)" in service
    assert "list_members(org_id, team_id)" in service
