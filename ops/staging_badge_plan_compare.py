"""Compare candidate event-aware badge indexes on the staging fixture."""
from __future__ import annotations

import argparse
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import psycopg2

INDEXES = {
    "badges": (
        "registration.ix_phase3_7_badges_participant_created_id",
        "CREATE INDEX ix_phase3_7_badges_participant_created_id "
        "ON registration.badges (participant_id, created_at DESC, id DESC)",
    ),
    "badge_history": (
        "registration.ix_phase3_7_badge_history_badge_created_id",
        "CREATE INDEX ix_phase3_7_badge_history_badge_created_id "
        "ON registration.badge_history (badge_id, created_at DESC, id DESC)",
    ),
}

QUERIES = {
    "badges_cursor": (
        "SELECT b.id, b.participant_id, b.created_at "
        "FROM registration.badges b "
        "JOIN registration.participants p ON p.id = b.participant_id "
        "WHERE p.event_id = %s::uuid "
        "ORDER BY b.created_at DESC, b.id DESC LIMIT 100"
    ),
    "badge_history_cursor": (
        "SELECT h.id, h.badge_id, h.created_at "
        "FROM registration.badge_history h "
        "JOIN registration.badges b ON b.id = h.badge_id "
        "JOIN registration.participants p ON p.id = b.participant_id "
        "WHERE p.event_id = %s::uuid "
        "ORDER BY h.created_at DESC, h.id DESC LIMIT 100"
    ),
}


def _safe_plan(raw: object) -> dict:
    root = (raw or [{}])[0]
    plan = root.get("Plan", {})
    indexes: list[str] = []
    node_types: list[str] = []
    stack = [plan]
    while stack:
        node = stack.pop()
        if node.get("Node Type"):
            node_types.append(str(node["Node Type"]))
        if node.get("Index Name"):
            indexes.append(str(node["Index Name"]))
        stack.extend(node.get("Plans", []))
    return {
        "planning_ms": root.get("Planning Time"),
        "execution_ms": root.get("Execution Time"),
        "node_types": node_types,
        "indexes": indexes,
    }


def _capture(cur, event_id: uuid.UUID) -> dict:
    result = {}
    for name, statement in QUERIES.items():
        cur.execute("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + statement, (str(event_id),))
        result[name] = _safe_plan(cur.fetchone()[0])
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event-id", required=True, type=uuid.UUID)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    url = os.environ.get("DATABASE_URL_SYNC", "")
    if not url:
        raise SystemExit("DATABASE_URL_SYNC is required")

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "event_id_hash": __import__("hashlib").sha256(str(args.event_id).encode("ascii")).hexdigest()[:16],
        "before": {},
        "after": {},
        "original_indexes": {},
        "restored": False,
    }
    conn = psycopg2.connect(url.replace("postgresql+psycopg2://", "postgresql://", 1))
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            for key, (qualified, _) in INDEXES.items():
                schema, name = qualified.split(".", 1)
                cur.execute(
                    "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname=%s AND indexname=%s)",
                    (schema, name),
                )
                report["original_indexes"][key] = bool(cur.fetchone()[0])
                cur.execute("DROP INDEX IF EXISTS " + qualified)
            cur.execute("ANALYZE registration.badges")
            cur.execute("ANALYZE registration.badge_history")
            cur.execute("ANALYZE registration.participants")
            report["before"] = _capture(cur, args.event_id)
            for _, (qualified, create_sql) in INDEXES.items():
                cur.execute(create_sql)
            cur.execute("ANALYZE registration.badges")
            cur.execute("ANALYZE registration.badge_history")
            cur.execute("ANALYZE registration.participants")
            report["after"] = _capture(cur, args.event_id)
    finally:
        with conn.cursor() as cur:
            for key, (qualified, create_sql) in INDEXES.items():
                cur.execute("DROP INDEX IF EXISTS " + qualified)
                if report["original_indexes"].get(key):
                    cur.execute(create_sql.replace("ix_phase3_7_", "ix_phase3_7_"))
            cur.execute("ANALYZE registration.badges")
            cur.execute("ANALYZE registration.badge_history")
            report["restored"] = True
        conn.close()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["restored"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
