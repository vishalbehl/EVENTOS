from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/search/router.py"
SERVICE = ROOT / "app/modules/search/application/commands.py"


def test_search_reindex_delegates_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def trigger_reindex", 1)[1]
    assert "SearchCommandService(db).trigger_reindex" in region
    assert "await db.commit()" not in region


def test_search_command_commits_before_dispatch_and_rolls_back():
    source = SERVICE.read_text(encoding="utf-8")
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
    assert "send_task" in source
    assert source.index("await self.db.commit()") < source.index("send_task")
