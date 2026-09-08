from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_team_mutation_responses_use_tenant_query_projection():
    source = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    helper = source.split("async def _team_out", 1)[1].split("@router.get(\"/teams\")", 1)[0]
    assert "OrganizationTeamQueryService(db).get_for_team" in helper
    assert "select(OrganizationTeamMember" not in helper
    assert "select(OrganizationTeamEvent" not in helper


def test_team_single_projection_is_tenant_scoped_and_stable():
    source = (ROOT / "app/modules/platform/application/organization_team_queries.py").read_text(encoding="utf-8")
    region = source.split("async def get_for_team", 1)[1]
    assert "OrganizationTeam.organization_id == organization_id" in region
    assert "OrganizationTeamMember.organization_id == organization_id" in region
    assert "OrganizationTeamEvent.organization_id == organization_id" in region
    assert "OrganizationTeamMember.organization_member_id.asc()" in region
    assert "OrganizationTeamEvent.event_id.asc()" in region
