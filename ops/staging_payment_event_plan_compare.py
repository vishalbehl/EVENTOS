"""Capture disposable before/after plans for payment-event timeline indexes."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
from psycopg2.extras import Json, execute_values


GLOBAL_INDEX = "commerce.ix_payment_events_timestamp_id"
TENANT_INDEX = "commerce.ix_payment_events_organization_timestamp_id"
MARKER_PREFIX = "phase3_7_plan_probe:"


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


def _plan(cur, label: str, organization_id: uuid.UUID) -> dict:
    if label == "global_timeline":
        statement = (
            "SELECT id, timestamp FROM commerce.payment_events "
            "ORDER BY timestamp DESC, id DESC LIMIT 50"
        )
        params = None
    else:
        statement = (
            "SELECT id, timestamp FROM commerce.payment_events "
            "WHERE organization_id = %s ORDER BY timestamp DESC, id DESC LIMIT 50"
        )
        params = (str(organization_id),)
    cur.execute("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + statement, params)
    return {"label": label, "plan": _safe_plan(cur.fetchone()[0])}


def _create_indexes(cur) -> None:
    cur.execute(
        "CREATE INDEX IF NOT EXISTS ix_payment_events_timestamp_id "
        "ON commerce.payment_events (timestamp, id)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS ix_payment_events_organization_timestamp_id "
        "ON commerce.payment_events (organization_id, timestamp, id)"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=int, default=5000)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if not 100 <= args.rows <= 20000:
        raise SystemExit("--rows must be between 100 and 20000")
    url = os.environ.get("DATABASE_URL_SYNC", "")
    if not url:
        raise SystemExit("DATABASE_URL_SYNC is required")

    marker = MARKER_PREFIX + uuid.uuid4().hex
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "rows_requested": args.rows,
        "tenant_hash": None,
        "before": [],
        "after": [],
        "indexes_restored": False,
        "cleanup_rows": 0,
    }
    conn = psycopg2.connect(url.replace("postgresql+psycopg2://", "postgresql://", 1))
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM platform.organizations ORDER BY id LIMIT 8")
            organization_rows = cur.fetchall()
            if not organization_rows:
                raise SystemExit("staging database has no organization for disposable plan data")
            organization_ids = [row[0] for row in organization_rows]
            organization_id = organization_ids[0]
            report["tenant_hash"] = hashlib.sha256(str(organization_id).encode("ascii")).hexdigest()[:16]
            now = datetime.now(timezone.utc)
            values = []
            for index in range(args.rows):
                # Keep the measured tenant selective so PostgreSQL can choose
                # the tenant-plus-order index for the tenant timeline query.
                if len(organization_ids) > 1 and index % 100:
                    scoped_org = organization_ids[1 + (index % (len(organization_ids) - 1))]
                else:
                    scoped_org = organization_id
                values.append(
                    (str(uuid.uuid4()), scoped_org, "PERF_PLAN_PROBE", Json({"marker": marker}), now - timedelta(seconds=index))
                )
            execute_values(
                cur,
                "INSERT INTO commerce.payment_events "
                "(id, organization_id, action_type, metadata_data, timestamp) VALUES %s",
                values,
                page_size=1000,
            )
            cur.execute("ANALYZE commerce.payment_events")
            cur.execute("SELECT COUNT(*) FROM commerce.payment_events WHERE metadata_data->>'marker' = %s", (marker,))
            inserted = int(cur.fetchone()[0])
            report["rows_inserted"] = inserted

            # This is a local staging probe. The finally block recreates both
            # indexes even when EXPLAIN fails.
            cur.execute("DROP INDEX IF EXISTS " + GLOBAL_INDEX)
            cur.execute("DROP INDEX IF EXISTS " + TENANT_INDEX)
            cur.execute("ANALYZE commerce.payment_events")
            report["before"] = [_plan(cur, "global_timeline", organization_id), _plan(cur, "tenant_timeline", organization_id)]

            _create_indexes(cur)
            cur.execute("ANALYZE commerce.payment_events")
            report["after"] = [_plan(cur, "global_timeline", organization_id), _plan(cur, "tenant_timeline", organization_id)]
            cur.execute(
                "SELECT indexname FROM pg_indexes WHERE schemaname = 'commerce' "
                "AND indexname IN ('ix_payment_events_timestamp_id', 'ix_payment_events_organization_timestamp_id')"
            )
            report["indexes_restored"] = len(cur.fetchall()) == 2
    finally:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM commerce.payment_events WHERE metadata_data->>'marker' = %s", (marker,))
            report["cleanup_rows"] = cur.rowcount
            _create_indexes(cur)
            cur.execute("ANALYZE commerce.payment_events")
            report["indexes_restored"] = True
        conn.close()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report.get("indexes_restored") and report.get("cleanup_rows") == report.get("rows_inserted") else 2


if __name__ == "__main__":
    raise SystemExit(main())
