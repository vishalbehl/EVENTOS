from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_privileged_access_list_delegates_to_query_service():
    source = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    region = source.split("async def list_privileged_access_sessions", 1)[1].split("async def revoke_privileged_access_session", 1)[0]
    assert "PrivilegedAccessQueryService(db).list" in region
    assert "select(PrivilegedAccessSession)" not in region


def test_privileged_access_query_is_actor_scoped_bounded_projected_and_stable():
    source = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = source.split("class PrivilegedAccessQueryService", 1)[1].split("class CommercialAccessQueryService", 1)[0]
    assert "PrivilegedAccessSession.organization_id == organization_id" in region
    assert "PrivilegedAccessSession.actor_user_id == actor_user_id" in region
    assert "max(1, min(int(limit), 100))" in region
    assert "load_only(*self._COLUMNS)" in region
    assert "PrivilegedAccessSession.created_at.desc()" in region
