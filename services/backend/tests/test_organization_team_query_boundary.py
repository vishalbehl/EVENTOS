from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_organization_team_list_uses_batched_projection():
    router = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/application/organization_team_queries.py").read_text(encoding="utf-8")
    region = router.split("async def list_organization_teams", 1)[1].split("async def create_organization_team", 1)[0]
    assert "OrganizationTeamQueryService(db).list_for_organization" in region
    assert "OrganizationTeamMember.team_id.in_(team_ids)" in queries
    assert "OrganizationTeamEvent.team_id.in_(team_ids)" in queries
    assert ".limit(self.MAX_TEAMS)" in queries
    assert "OrganizationTeam.organization_id == organization_id" in queries
