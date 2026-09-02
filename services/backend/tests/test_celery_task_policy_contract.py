from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TASK_ROOTS = (ROOT / "app/tasks", ROOT / "app/modules")


def _task_decorators(path: Path):
    tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call):
                continue
            if not isinstance(decorator.func, ast.Attribute) or decorator.func.attr != "task":
                continue
            if not isinstance(decorator.func.value, ast.Name) or decorator.func.value.id != "celery_app":
                continue
            yield node, {keyword.arg for keyword in decorator.keywords if keyword.arg}


def test_every_celery_task_declares_timeout_and_queue_policy():
    violations = []
    for root in TASK_ROOTS:
        for path in root.rglob("*.py"):
            for node, keywords in _task_decorators(path):
                missing = {"soft_time_limit", "time_limit"} - keywords
                if missing:
                    violations.append(f"{path.relative_to(ROOT)}:{node.lineno}: missing {sorted(missing)}")
    assert not violations, "Celery task policy violations:\n" + "\n".join(violations)
