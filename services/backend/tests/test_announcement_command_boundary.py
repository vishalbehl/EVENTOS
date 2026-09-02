from __future__ import annotations

import ast
import inspect
from pathlib import Path

from app.modules.notifications.application.announcement_commands import AnnouncementCommandService


def test_announcement_mutations_delegate_transaction_ownership():
    path = Path(__file__).resolve().parents[1] / "app/modules/notifications/routers/announcements.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    functions = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    for name, delegation in {
        "create_announcement": "AnnouncementCommandService.create",
        "delete_announcement": "AnnouncementCommandService.archive",
    }.items():
        segment = ast.get_source_segment(source, functions[name]) or ""
        assert delegation in segment
        assert "await db.commit()" not in segment
        assert "db.add(" not in segment


def test_announcement_commands_own_commit_and_rollback():
    source = inspect.getsource(AnnouncementCommandService)
    assert source.count("await db.commit()") == 2
    assert "await db.rollback()" in source
    assert "IDEMPOTENCY_CONFLICT" in source
    assert "with_for_update" in source
