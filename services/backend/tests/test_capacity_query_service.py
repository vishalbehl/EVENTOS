from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/venue/routers/capacity.py"
SERVICE = ROOT / "app/modules/venue/application/capacity_queries.py"


def test_capacity_status_uses_query_service_without_queries_inside_router_loop():
    source = ROUTER.read_text(encoding="utf-8")
    assert "CapacityQueryService(db).get_status" in source
    status_body = source.split('async def get_capacity_status', 1)[1].split(
        '@router.post("/promote"', 1
    )[0]
    assert "await db.execute" not in status_body
    assert "await db.get" not in status_body


def test_capacity_query_service_batches_targets_and_aggregates_occupancy():
    source = SERVICE.read_text(encoding="utf-8")
    assert "MAX_RULES = 500" in source
    assert "group_by(CheckIn.session_id)" in source
    assert "group_by(Session.room_id)" in source
    assert "Session.event_id == event_id" in source
    assert "CheckIn.event_id == event_id" in source
    assert "db.add" not in source
    assert "db.commit" not in source
