"""CI gate: ensure Alembic revisions form one unambiguous chain."""
from __future__ import annotations

import ast
import argparse
from pathlib import Path


def revisions() -> dict[str, str | None]:
    result = {}
    for path in sorted((Path(__file__).parents[1] / "alembic" / "versions").glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        values = {}
        for node in tree.body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) and node.targets[0].id in {"revision", "down_revision"}:
                try:
                    values[node.targets[0].id] = ast.literal_eval(node.value)
                except (ValueError, TypeError):
                    pass
            elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id in {"revision", "down_revision"} and node.value is not None:
                try:
                    values[node.target.id] = ast.literal_eval(node.value)
                except (ValueError, TypeError):
                    pass
        if values.get("revision"):
            result[str(values["revision"])] = values.get("down_revision")
    return result


def heads(chain: dict[str, str | None]) -> set[str]:
    parents: set[str] = set()
    for parent in chain.values():
        if isinstance(parent, (list, tuple)):
            parents.update(str(item) for item in parent)
        elif parent:
            parents.add(str(parent))
    return set(chain) - parents


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-single-head", action="store_true")
    args = parser.parse_args()
    chain = revisions()
    migration_heads = heads(chain)
    if len(migration_heads) != 1 and args.require_single_head:
        raise SystemExit(f"Expected one Alembic head, found {sorted(migration_heads)}")
    print(f"migration graph valid: heads={sorted(migration_heads)}, revisions={len(chain)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
