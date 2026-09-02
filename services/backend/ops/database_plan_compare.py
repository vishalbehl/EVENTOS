"""Compare two sanitized hot-query plan reports without retaining SQL values."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def _index_names(node: object) -> list[str]:
    names: list[str] = []
    if isinstance(node, dict):
        value = node.get("Index Name")
        if isinstance(value, str) and value:
            names.append(value)
        for child in node.get("Plans", []) if isinstance(node.get("Plans", []), list) else []:
            names.extend(_index_names(child))
    elif isinstance(node, list):
        for child in node:
            names.extend(_index_names(child))
    return sorted(set(names))


def compare_reports(baseline: dict, current: dict) -> dict:
    baseline_plans = baseline.get("plans", {})
    current_plans = current.get("plans", {})
    names = sorted(set(baseline_plans) | set(current_plans))
    comparisons: dict[str, dict] = {}
    for name in names:
        before = baseline_plans.get(name, {})
        after = current_plans.get(name, {})
        before_ms = before.get("execution_time_ms")
        after_ms = after.get("execution_time_ms")
        delta_pct = None
        if isinstance(before_ms, (int, float)) and before_ms:
            delta_pct = round(((float(after_ms) - float(before_ms)) / float(before_ms)) * 100, 2) if isinstance(after_ms, (int, float)) else None
        comparisons[name] = {
            "baseline_ms": before_ms,
            "current_ms": after_ms,
            "delta_pct": delta_pct,
            "baseline_indexes": _index_names(before.get("plan")),
            "current_indexes": _index_names(after.get("plan")),
            "baseline_error": before.get("error"),
            "current_error": after.get("error"),
        }
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "baseline_event_id_hash": baseline.get("event_id_hash"),
        "current_event_id_hash": current.get("event_id_hash"),
        "same_event": baseline.get("event_id_hash") == current.get("event_id_hash"),
        "queries": comparisons,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("current", type=Path)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--require-same-event", action="store_true")
    args = parser.parse_args()
    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    current = json.loads(args.current.read_text(encoding="utf-8"))
    report = compare_reports(baseline, current)
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 2 if args.require_same_event and not report["same_event"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
