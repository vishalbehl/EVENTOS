from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_member_access_preview_is_batched_in_query_service():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/organiser/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def preview_team_member_access_loss", 1)[1].split("@router.put(\"/teams/{team_id}/events", 1)[0]

    assert "OrganiserTeamQueryService(db).preview_member_access_loss" in region
    assert "select(OrganizationTeam" not in region
    assert "for assignment, event_name in assignments" not in region
    assert "retained_by_event" in queries
    assert "OrganizationTeamEvent.event_id.in_(event_ids)" in queries
