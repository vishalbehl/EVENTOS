from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_srr_reads_use_bounded_tenant_safe_query_service():
    router = (ROOT / "app/modules/venue/routers/srr.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/venue/application/queries.py").read_text(encoding="utf-8")

    stations = router.split("async def list_stations", 1)[1].split("@router.", 1)[0]
    checkins = router.split("async def list_checkins", 1)[1].split("async def qr_checkin", 1)[0]
    assert "SrrQueryService(db).list_stations" in stations
    assert "SrrQueryService(db).list_checkins" in checkins
    assert "await db.execute" not in stations
    assert "await db.execute" not in checkins
    assert "Event.organization_id == organization_id" in queries
    assert ".order_by(SRRStation.station_number, SRRStation.id)" in queries
    assert ".order_by(SRRCheckin.checked_in_at.desc(), SRRCheckin.id.desc())" in queries
    assert ".limit(bounded_limit)" in queries
