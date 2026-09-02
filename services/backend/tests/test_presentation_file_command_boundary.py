from __future__ import annotations

import ast
import inspect
from pathlib import Path

from app.modules.presentations.application.commands import PresentationFileCommandService


def test_presentation_file_mutations_delegate_transaction_ownership():
    path = Path(__file__).resolve().parents[1] / "app/modules/presentations/routers/files.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    functions = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    for name in ("approve_file", "reject_file", "lock_file"):
        segment = ast.get_source_segment(source, functions[name]) or ""
        assert "PresentationFileCommandService.apply" in segment
        assert "await db.commit()" not in segment


def test_presentation_file_command_service_commits_and_rolls_back():
    source = inspect.getsource(PresentationFileCommandService.apply)
    assert "await db.commit()" in source
    assert "await db.rollback()" in source
    assert "PresentationFileAdministrationService.apply" in source
