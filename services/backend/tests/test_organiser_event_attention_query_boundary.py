from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_event_attention_uses_single_tenant_scoped_aggregate_projection():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/organiser/application/queries.py").read_text(encoding="utf-8")
    helper = router.split("async def _attention_for_event", 1)[1].split("@router.get(\"/needs-attention\"", 1)[0]
    route = router.split("async def event_needs_attention", 1)[1]

    assert "OrganiserAttentionQueryService(db).get_candidate" in helper
    assert "await db.scalar" not in helper
    assert "class OrganiserAttentionQueryService" in queries
    assert "Event.organization_id == organization_id" in queries
    assert "total_rooms.label(\"total_rooms\")" in queries
    assert "await db.get(Event, event_id)" not in route
