from __future__ import annotations

import ast
import inspect
from pathlib import Path

from app.modules.analytics.application.commands import AnalyticsExportCommandService
from app.modules.analytics.application.queries import AnalyticsExportQueryService


def test_analytics_export_route_delegates_transaction_ownership():
    path = Path(__file__).resolve().parents[1] / "app/modules/analytics/routers/analytics.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    route = next(
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name == "request_analytics_export"
    )
    segment = ast.get_source_segment(source, route) or ""
    assert "AnalyticsExportCommandService.request" in segment
    assert "await db.commit()" not in segment
    assert "db.add(" not in segment


def test_analytics_export_command_service_owns_write_operations():
    members = inspect.getmembers(AnalyticsExportCommandService)
    assert any(name == "request" for name, _ in members)
    source = inspect.getsource(AnalyticsExportCommandService.request)
    assert "await db.commit()" in source
    assert "UsageReservationService.reserve" in source
    assert "idempotency_key" in source
    assert "TenantContextGuard.scoped" in source


def test_analytics_export_read_routes_delegate_to_projection_service():
    path = Path(__file__).resolve().parents[1] / "app/modules/analytics/routers/analytics.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    functions = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    for name in ("get_analytics_export", "download_analytics_export"):
        segment = ast.get_source_segment(source, functions[name]) or ""
        assert "AnalyticsExportQueryService(db).get_for_event" in segment
        assert "select(DataExport)" not in segment


def test_analytics_export_query_service_is_read_only():
    members = inspect.getmembers(AnalyticsExportQueryService)
    assert any(name == "get_for_event" for name, _ in members)
    assert not any(name in {"commit", "flush", "add", "delete"} for name, _ in members)
