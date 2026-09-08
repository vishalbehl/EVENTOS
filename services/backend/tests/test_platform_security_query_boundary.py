from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = (ROOT / "app/modules/platform/router.py").read_text(encoding="utf-8")
SERVICE = (ROOT / "app/modules/platform/application/security_queries.py").read_text(encoding="utf-8")


def test_security_feed_delegates_all_reads_to_query_service():
    region = ROUTER.split("async def get_security_events", 1)[1].split("# C6:", 1)[0]
    assert "PlatformSecurityEventQueryService(db).dashboard_feed" in region
    assert "FROM identity.security_events" not in region
    assert "await db.execute" not in region


def test_security_query_service_is_bounded_and_explicitly_ordered():
    assert "SecurityEvent.risk_level == severity" in SERVICE
    assert "SecurityEvent.event_type == event_type" in SERVICE
    assert "select(\n                    SecurityEvent.id" in SERVICE
    assert "SecurityEvent.occurred_at.desc(), SecurityEvent.id.desc()" in SERVICE
    assert ".limit(bounded + 1)" in SERVICE
    assert "await self.db.commit()" not in SERVICE
