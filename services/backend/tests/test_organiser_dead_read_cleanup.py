from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_obsolete_router_readiness_query_loop_is_removed():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    assert "async def _event_readiness" not in router
    assert "sessions_with_speaker = await db.scalar" not in router
