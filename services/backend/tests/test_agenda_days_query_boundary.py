from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_agenda_days_route_uses_single_query_service_read():
    router = (ROOT / "app/modules/agenda/routers/agenda_router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/agenda/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def list_agenda_days", 1)[1].split("@router.post(\"/agenda-days\"", 1)[0]

    assert "AgendaQueryService(db).list_days_for_event" in region
    assert "AgendaService" not in region
    assert "default_agenda_id" in queries
    assert "AgendaDay.agenda_id == default_agenda_id" in queries
    assert ".limit(100)" in queries
