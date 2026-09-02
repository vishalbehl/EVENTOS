from __future__ import annotations

import ast
import inspect
from pathlib import Path

from app.modules.presentations.application.commands import PresentationFileCommandService


def test_confirm_upload_route_delegates_database_mutation():
    path = Path(__file__).resolve().parents[1] / "app/modules/presentations/routers/files.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    route = next(
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name == "confirm_upload"
    )
    segment = ast.get_source_segment(source, route) or ""
    assert "PresentationFileCommandService.confirm_upload" in segment
    assert "await db.commit()" not in segment
    assert "enqueue_event_speaker_projection_refresh" in segment


def test_confirm_upload_command_owns_commit_and_rollback():
    source = inspect.getsource(PresentationFileCommandService.confirm_upload)
    assert "await db.commit()" in source
    assert "await db.rollback()" in source
    assert "UsageReservationService.consume" in source
    assert "MeteringService.record" in source


def test_upload_session_route_delegates_record_persistence():
    path = Path(__file__).resolve().parents[1] / "app/modules/presentations/routers/files.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    route = next(
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name == "request_upload_url"
    )
    segment = ast.get_source_segment(source, route) or ""
    assert "PresentationFileCommandService.create_upload_record" in segment
    assert "await db.commit()" not in segment
