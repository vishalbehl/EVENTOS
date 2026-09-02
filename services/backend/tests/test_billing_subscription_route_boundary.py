from __future__ import annotations

import ast
from pathlib import Path


def test_subscription_list_delegates_to_bounded_query_service():
    path = Path(__file__).resolve().parents[1] / "app/modules/billing/routers/activations.py"
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    route = next(
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name == "list_subscriptions"
    )
    segment = ast.get_source_segment(source, route) or ""
    assert "list_active_subscriptions" in segment
    assert "EntitlementResolver.get_active_subscriptions" not in segment
    assert "await db.commit()" not in segment
    assert "db.add(" not in segment
