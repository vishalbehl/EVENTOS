"""Compare the task-failure tenant timeline plan before and after its index."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

import psycopg2


UUID_RE = re.compile(r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b")
INDEX = "ix_task_failures_org_created_id"


def _redact(value):
    if isinstance(value, str):
        return UUID_RE.sub("<uuid>", value)
    if isinstance(value, list):
        return [_redact(item) for item in value]
    if isinstance(value, dict):
        return {key: _redact(item) for key, item in value.items()}
    return value


def _plan(cur, statement: str) -> dict:
    cur.execute("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + statement)
    document = cur.fetchone()[0][0]
    plan = document.get("Plan", {})
    nodes: list[str] = []
    indexes: list[str] = []
    stack = [plan]
    while stack:
        node = stack.pop()
        if node.get("Node Type"):
            nodes.append(node["Node Type"])
        if node.get("Index Name"):
            indexes.append(node["Index Name"])
        stack.extend(node.get("Plans", []))
    return {
        "execution_time_ms": document.get("Execution Time"),
        "planning_time_ms": document.get("Planning Time"),
        "node_types": nodes,
        "indexes": indexes,
        "shared_hit_blocks": plan.get("Shared Hit Blocks"),
        "shared_read_blocks": plan.get("Shared Read Blocks"),
        "rows_removed_by_filter": plan.get("Rows Removed by Filter"),
        "plan": _redact(plan),
    }


def main(output: Path | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event-id", type=uuid.UUID, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    url = os.environ["DATABASE_URL_SYNC"].replace("postgresql+psycopg2://", "postgresql://", 1)
    statement = (
        "SELECT id, created_at FROM operations.task_failures "
        "WHERE organization_id = (SELECT organization_id FROM events.events "
        f"WHERE id = '{args.event_id}'::uuid) "
        "ORDER BY created_at DESC, id DESC LIMIT 100"
    )
    conn = psycopg2.connect(url)
    try:
        with conn.cursor() as cur:
            cur.execute("BEGIN")
            cur.execute(f'DROP INDEX IF EXISTS operations."{INDEX}"')
            before = _plan(cur, statement)
            cur.execute("ROLLBACK")
            after = _plan(cur, statement)
            cur.execute("BEGIN")
            cur.execute("SET LOCAL enable_seqscan = off")
            after_forced_index = _plan(cur, statement)
            cur.execute("ROLLBACK")
            cur.execute(
                "SELECT 1 FROM pg_indexes WHERE schemaname='operations' AND indexname=%s",
                (INDEX,),
            )
            index_present = cur.fetchone() is not None
    finally:
        conn.close()
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "event_id_hash": hashlib.sha256(str(args.event_id).encode()).hexdigest()[:16],
        "index": INDEX,
        "index_present_after_probe": index_present,
        "before_without_index": before,
        "after_with_index": after,
        "after_with_index_forced": after_forced_index,
        "improved_execution_time": (
            isinstance(before["execution_time_ms"], (int, float))
            and isinstance(after["execution_time_ms"], (int, float))
            and after["execution_time_ms"] <= before["execution_time_ms"]
        ),
        "uses_new_index": INDEX in after["indexes"],
        "forced_index_path_available": INDEX in after_forced_index["indexes"],
    }
    report["passed"] = bool(
        report["index_present_after_probe"]
        and report["forced_index_path_available"]
        and report["improved_execution_time"]
    )
    rendered = json.dumps(report, indent=2, sort_keys=True)
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--event-id", type=uuid.UUID, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    raise SystemExit(main(args.output))
