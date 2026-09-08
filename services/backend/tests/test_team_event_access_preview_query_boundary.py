from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_event_access_preview_uses_batched_query_service():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/organiser/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def preview_team_event_access_loss", 1)[1].split("@router.get(\"/locations\"", 1)[0]

    assert "OrganiserTeamQueryService(db).preview_event_access_loss" in region
    assert "select(OrganizationTeamEvent" not in region
    assert "for member_id in member_ids" not in region
    assert "retained_by_member" in queries
    assert "OrganizationTeamMember.organization_member_id.in_(member_ids)" in queries
