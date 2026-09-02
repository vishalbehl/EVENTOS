"""Capture bounded, read-only PostgreSQL plans for portal hot paths."""
from __future__ import annotations

import argparse
import json
import os
import re
import uuid
from hashlib import sha256
from datetime import datetime, timezone
from pathlib import Path

import psycopg2

QUERIES = {
    "participants_page": "SELECT id, event_id, registered_at FROM registration.participants WHERE event_id = %s::uuid AND deleted_at IS NULL ORDER BY registered_at DESC, id DESC LIMIT 100",
    "registrations_page": "SELECT id, event_id, submitted_at FROM registration.registrations WHERE event_id = %s::uuid AND deleted_at IS NULL ORDER BY submitted_at DESC, id DESC LIMIT 100",
    "latest_payments": "SELECT id, registration_id, created_at FROM registration.payment_transactions WHERE event_id = %s::uuid ORDER BY created_at DESC, id DESC LIMIT 100",
    "participant_count": "SELECT count(*) FROM registration.participants WHERE event_id = %s::uuid AND deleted_at IS NULL",
    "registration_count": "SELECT count(*) FROM registration.registrations WHERE event_id = %s::uuid AND deleted_at IS NULL",
    "sessions_cursor": "SELECT id, event_id, start_time FROM agenda.sessions WHERE event_id = %s::uuid AND deleted_at IS NULL ORDER BY start_time ASC, id ASC LIMIT 100",
    "badges_cursor": "SELECT b.id, b.participant_id, b.created_at FROM registration.badges b JOIN registration.participants p ON p.id = b.participant_id WHERE p.event_id = %s::uuid ORDER BY b.created_at DESC, b.id DESC LIMIT 100",
    "badge_history_cursor": "SELECT h.id, h.badge_id, h.created_at FROM registration.badge_history h JOIN registration.badges b ON b.id = h.badge_id JOIN registration.participants p ON p.id = b.participant_id WHERE p.event_id = %s::uuid ORDER BY h.created_at DESC, h.id DESC LIMIT 100",
    "badge_print_jobs_cursor": "SELECT j.id, j.badge_id, j.queued_at FROM registration.badge_print_jobs j JOIN registration.badges b ON b.id = j.badge_id JOIN registration.participants p ON p.id = b.participant_id WHERE p.event_id = %s::uuid ORDER BY j.queued_at DESC, j.id DESC LIMIT 100",
    "import_jobs_cursor": "SELECT j.id, j.event_id, j.created_at FROM registration.import_jobs j WHERE j.event_id = %s::uuid ORDER BY j.created_at DESC, j.id DESC LIMIT 100",
}

_UUID_RE = re.compile(
    r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-"
    r"[89ab][0-9a-f]{3}-[0-9a-f]{12}\b"
)


def _redact_plan(value):
    """Remove bound UUID values that PostgreSQL embeds in rendered plans."""
    if isinstance(value, str):
        return _UUID_RE.sub("<uuid>", value)
    if isinstance(value, list):
        return [_redact_plan(item) for item in value]
    if isinstance(value, dict):
        return {key: _redact_plan(item) for key, item in value.items()}
    return value

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event-id", required=True, type=uuid.UUID)
    parser.add_argument("--output", default="")
    args = parser.parse_args()
    url = os.environ.get("DATABASE_URL_SYNC", "")
    if not url:
        raise SystemExit("DATABASE_URL_SYNC is required")
    report: dict[str, object] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "event_id_hash": sha256(str(args.event_id).encode("ascii")).hexdigest()[:16],
        "analysis": "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)",
        "plans": {},
    }
    conn = psycopg2.connect(url.replace("postgresql+psycopg2://", "postgresql://", 1))
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            for name, statement in QUERIES.items():
                try:
                    cur.execute("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + statement, (str(args.event_id),))
                    raw = cur.fetchone()[0]
                    plan = raw[0] if isinstance(raw, list) else raw
                    report["plans"][name] = {"planning_time_ms": plan.get("Planning Time"), "execution_time_ms": plan.get("Execution Time"), "plan": _redact_plan(plan.get("Plan"))}
                except Exception as exc:
                    report["plans"][name] = {"error": type(exc).__name__, "message": str(exc).splitlines()[0][:200]}
    finally:
        conn.close()
    rendered = json.dumps(report, indent=2, sort_keys=True, default=str)
    if args.output:
        destination = Path(args.output)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0 if all("error" not in item for item in report["plans"].values()) else 2

if __name__ == "__main__":
    raise SystemExit(main())
