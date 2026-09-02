from __future__ import annotations

import ast
from pathlib import Path


def test_platform_flag_mutations_delegate_transaction_ownership():
    path = (
        Path(__file__).resolve().parents[1]
        / "app/modules/billing/routers/capabilities.py"
    )
    source = path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(path))
    expected = {
        "sync_capability_catalogue": "PlatformFlagCommandService.sync_catalogue",
        "create_flag": "PlatformFlagCommandService.create_flag",
        "update_flag": "PlatformFlagCommandService.update_flag",
        "request_flag_override": "PlatformFlagCommandService.request_override",
        "decide_flag_override": "PlatformFlagCommandService.decide_override",
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

