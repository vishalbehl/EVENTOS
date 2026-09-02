"""Emit a safe, read-only PostgreSQL performance evidence report."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone

import psycopg2


_WHITESPACE_RE = re.compile(r"\s+")
_UUID_RE = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b")
_EMAIL_RE = re.compile(r"\b[^\s'\"]+@[^\s'\"]+\b")
_QUOTED_VALUE_RE = re.compile(r"'(?:''|[^'])*'")
_MAINTENANCE_QUERY_RE = re.compile(r"^(DROP|CREATE|ALTER|TRUNCATE)\b", re.IGNORECASE)
_BULK_QUERY_RE = re.compile(r"^(COPY|VACUUM|ANALYZE)\b", re.IGNORECASE)


def _is_operational_query(query: str) -> bool:
    """Keep schema-maintenance noise out of the application query inventory."""
    return not _MAINTENANCE_QUERY_RE.match(str(query or "").lstrip())


def _query_class(query: str) -> str:
    """Classify workload so fixture loading cannot hide OLTP hotspots."""
    text = str(query or "").lstrip()
    if _MAINTENANCE_QUERY_RE.match(text):
        return "maintenance"
    if _BULK_QUERY_RE.match(text):
        return "bulk"
    return "application"


def _safe_query_fingerprint(query: str) -> tuple[str, str]:
    """Return bounded diagnostic text without retaining literal values."""
    normalized = _WHITESPACE_RE.sub(" ", str(query or "")).strip()
    normalized = _QUOTED_VALUE_RE.sub("<literal>", normalized)
    normalized = _UUID_RE.sub("<uuid>", normalized)
    normalized = _EMAIL_RE.sub("<email>", normalized)
    normalized = normalized[:240]
    fingerprint = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]
    return fingerprint, normalized


def _plan_summary(plan_document: list) -> dict:
    """Keep EXPLAIN evidence small while retaining index-use signals."""
    root = (plan_document or [{}])[0]
    plan = root.get("Plan", {})
    node_types = []
    indexes = []
    stack = [plan]
    while stack:
        node = stack.pop()
        if node.get("Node Type"):
            node_types.append(node["Node Type"])
        if node.get("Index Name"):
            indexes.append(node["Index Name"])
        stack.extend(node.get("Plans", []))
    return {
        "planning_ms": root.get("Planning Time"),
        "execution_ms": root.get("Execution Time"),
        "node_types": node_types,
        "indexes": indexes,
    }


def _explain_index_query(cur, label: str, query: str, params=None) -> dict:
    """Run a fixed, parameter-free read-only plan probe for scale evidence."""
    try:
        cur.execute(f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {query}", params)
        return {"label": label, "query": query, "available": True,
                "plan": _plan_summary(cur.fetchone()[0])}
    except Exception as exc:
        return {"label": label, "query": query, "available": False,
                "error": type(exc).__name__}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="")
    parser.add_argument("--require-pg-stat-statements", action="store_true")
    parser.add_argument("--include-index-plans", action="store_true")
    args = parser.parse_args()
    url = os.environ.get("DATABASE_URL_SYNC", "")
    if not url:
        raise SystemExit("DATABASE_URL_SYNC is required")
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "pg_stat_statements": {"available": False, "error": None},
        "top_queries": [],
        "top_application_queries": [],
        "top_bulk_queries": [],
        "index_plans": [],
    }
    # SQLAlchemy URLs include the driver suffix; psycopg2 expects the base
    # PostgreSQL scheme.
    conn = psycopg2.connect(url.replace("postgresql+psycopg2://", "postgresql://", 1))
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            try:
                cur.execute("CREATE EXTENSION IF NOT EXISTS pg_stat_statements")
                cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'")
                report["pg_stat_statements"]["available"] = cur.fetchone() is not None
            except Exception as exc:
                report["pg_stat_statements"]["error"] = type(exc).__name__
            if report["pg_stat_statements"]["available"]:
                cur.execute(
                    """SELECT queryid, calls, round(total_exec_time::numeric, 2),
                              round(mean_exec_time::numeric, 2), rows,
                              left(regexp_replace(query, '\\s+', ' ', 'g'), 240)
                       FROM pg_stat_statements
                      WHERE calls > 0
                        AND query !~* '^(DROP|CREATE|ALTER|TRUNCATE)\\s'
                   ORDER BY total_exec_time DESC
                      LIMIT 100"""
                )
                rows = cur.fetchall()
                for row in rows:
                    fingerprint, safe_query = _safe_query_fingerprint(row[5])
                    item = {
                        "query_id": row[0],
                        "fingerprint": fingerprint,
                        "calls": row[1],
                        "total_ms": float(row[2]),
                        "mean_ms": float(row[3]),
                        "rows": row[4],
                        "query": safe_query,
                        "query_class": _query_class(row[5]),
                    }
                    report["top_queries"].append(item)
                    if item["query_class"] == "bulk":
                        report["top_bulk_queries"].append(item)
                    elif item["query_class"] == "application":
                        report["top_application_queries"].append(item)
                report["top_queries"] = report["top_queries"][:20]
                report["top_application_queries"] = report["top_application_queries"][:20]
                report["top_bulk_queries"] = report["top_bulk_queries"][:20]
            if args.include_index_plans:
                cur.execute(
                    """SELECT indexname FROM pg_indexes
                       WHERE schemaname = 'commerce'
                         AND indexname IN (
                           'ix_payment_events_timestamp_id',
                           'ix_payment_events_organization_timestamp_id'
                         )
                       ORDER BY indexname"""
                )
                report["index_inventory"] = [row[0] for row in cur.fetchall()]
                cur.execute(
                    "SELECT organization_id FROM commerce.payment_events "
                    "WHERE organization_id IS NOT NULL LIMIT 1"
                )
                tenant_id = cur.fetchone()
                report["index_plans"] = [
                    _explain_index_query(
                        cur,
                        "payment_events_global_timeline",
                        "SELECT id, timestamp FROM commerce.payment_events "
                        "ORDER BY timestamp DESC, id DESC LIMIT 50",
                    ),
                ]
                if tenant_id:
                    report["index_plans"].append(
                        _explain_index_query(
                            cur,
                            "payment_events_tenant_timeline",
                            "SELECT id, timestamp FROM commerce.payment_events "
                            "WHERE organization_id = %s "
                            "ORDER BY timestamp DESC, id DESC LIMIT 50",
                            (tenant_id[0],),
                        )
                    )
    finally:
        conn.close()
    output = json.dumps(report, indent=2, sort_keys=True)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(output + "\n")
    print(output)
    if args.require_pg_stat_statements and not report["pg_stat_statements"]["available"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
