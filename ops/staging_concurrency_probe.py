"""Measure tenant-scoped optimistic updates and duplicate check-in handling."""
from __future__ import annotations

import argparse
import json
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import psycopg2


def connect():
    url = os.environ["DATABASE_URL_SYNC"].replace("postgresql+psycopg2://", "postgresql://", 1)
    return psycopg2.connect(url)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    participant_id, event_id, organization_id, session_id = None, None, None, None
    started = time.perf_counter()
    db = connect()
    try:
        with db:
            with db.cursor() as cur:
                cur.execute("""SELECT e.id, e.organization_id, s.id
                    FROM events.events e JOIN agenda.sessions s ON s.event_id=e.id
                    WHERE e.deleted_at IS NULL AND s.deleted_at IS NULL
                    ORDER BY e.created_at, e.id, s.id LIMIT 1""")
                event = cur.fetchone()
                if not event:
                    raise RuntimeError("no event available")
                event_id, organization_id, session_id = (str(value) for value in event)
                participant_id = str(uuid.uuid4())
                cur.execute("""INSERT INTO registration.participants
                    (id,event_id,first_name,last_name,roles,approval_status,paid_status,badge_status,checkin_status,source,custom_fields,registered_at,updated_at,version)
                    VALUES (%s,%s,'probe','participant','[]','Approved','Unpaid','Unprinted','Pending','staging_probe','{}',NOW(),NOW(),1)""", (participant_id, event_id))
        def update(value: str) -> int:
            c = connect()
            try:
                with c:
                    with c.cursor() as cur:
                        cur.execute("UPDATE registration.participants SET first_name=%s, version=version+1, updated_at=NOW() WHERE id=%s AND event_id=%s AND version=1", (value, participant_id, event_id))
                        return cur.rowcount
            finally:
                c.close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            update_counts = list(pool.map(update, ("winner-a", "winner-b")))
        def checkin() -> int:
            c = connect()
            try:
                with c:
                    with c.cursor() as cur:
                        cur.execute("INSERT INTO registration.attendance (id,event_id,participant_id,session_id,check_in_time,updated_at) VALUES (%s,%s,%s,%s,NOW(),NOW()) ON CONFLICT (event_id,participant_id,session_id) DO NOTHING", (str(uuid.uuid4()), event_id, participant_id, session_id))
                        return cur.rowcount
            finally:
                c.close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            checkin_counts = list(pool.map(lambda _: checkin(), (1, 2)))
        report = {
            "event_id_hash": __import__("hashlib").sha256(str(event_id).encode()).hexdigest()[:16],
            "organization_id_hash": __import__("hashlib").sha256(str(organization_id).encode()).hexdigest()[:16],
            "optimistic_update_rowcounts": sorted(update_counts),
            "checkin_insert_rowcounts": sorted(checkin_counts),
            "single_update_won": sorted(update_counts) == [0, 1],
            "single_checkin_won": sorted(checkin_counts) == [0, 1],
            "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
        }
    finally:
        cleanup = connect()
        try:
            with cleanup:
                with cleanup.cursor() as cur:
                    if participant_id:
                        cur.execute("DELETE FROM registration.attendance WHERE participant_id=%s", (participant_id,))
                        cur.execute("DELETE FROM registration.participants WHERE id=%s", (participant_id,))
        finally:
            cleanup.close()
        db.close()
    report["passed"] = report["single_update_won"] and report["single_checkin_won"]
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
