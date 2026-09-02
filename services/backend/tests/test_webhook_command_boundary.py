from __future__ import annotations

import ast
import inspect
from pathlib import Path

from app.modules.notifications.application.commands import WebhookCommandService
from app.modules.notifications.application.queries import WebhookQueryService


def test_webhook_mutation_routes_delegate_transaction_ownership():
    path = Path(__file__).resolve().parents[1] / "app/modules/notifications/routers/webhooks.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    expected = {
        "create_webhook": "WebhookCommandService.create",
        "update_webhook": "WebhookCommandService.update",
        "delete_webhook": "WebhookCommandService.archive",
    }
    functions = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    for name, delegation in expected.items():
        segment = ast.get_source_segment(source, functions[name]) or ""
        assert delegation in segment
        assert "await db.commit()" not in segment
        assert "db.add(" not in segment


def test_webhook_command_service_contains_transaction_and_replay_guards():
    source = inspect.getsource(WebhookCommandService)
    assert "await db.commit()" in source
    assert "await db.rollback()" in source
    assert "IDEMPOTENCY_CONFLICT" in source
    assert "with_for_update" in source


def test_webhook_read_routes_delegate_to_query_service():
    path = Path(__file__).resolve().parents[1] / "app/modules/notifications/routers/webhooks.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    functions = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    assert "WebhookQueryService(db).list_for_event" in (
        ast.get_source_segment(source, functions["list_webhooks"]) or ""
    )
    assert "WebhookQueryService(db).get_for_event" in (
        ast.get_source_segment(source, functions["get_webhook"]) or ""
    )


def test_webhook_query_service_is_bounded_and_read_only():
    source = inspect.getsource(WebhookQueryService)
    assert "MAX_PAGE_SIZE = 100" in source
    assert "WebhookResponse" in source
    assert not any(name in {"commit", "flush", "add", "delete"} for name, _ in inspect.getmembers(WebhookQueryService))
