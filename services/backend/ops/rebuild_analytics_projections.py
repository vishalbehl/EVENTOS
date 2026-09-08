"""Rebuild durable event analytics projections in bounded, resumable batches.

The authoritative registration, attendance, payment, and speaker tables remain
the source of truth. Each event is rebuilt in its own transaction so a failed
event can be retried without losing already completed work.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

# Import the model registry before compiling Event relationships.  Operational
# scripts do not pass through the application startup model bootstrap.
import app.models  # noqa: F401,E402

from app.database import AsyncSessionLocal, tenant_org_id
from app.modules.analytics.services.event_attendance_projection import refresh_event_attendance_summary
from app.modules.analytics.services.event_payment_projection import refresh_event_payment_summary
from app.modules.analytics.services.event_registration_projection import refresh_event_registration_summary
from app.modules.analytics.services.event_speaker_projection import refresh_event_speaker_summary
from app.modules.events.models.event import Event


async def _event_page(
    *,
    after_created_at: datetime | None,
    after_event_id: uuid.UUID | None,
    limit: int,
) -> list[tuple[uuid.UUID, uuid.UUID, datetime]]:
    statement = select(Event.id, Event.organization_id, Event.created_at).where(
        Event.deleted_at.is_(None)
    )
    if after_created_at is not None and after_event_id is not None:
        statement = statement.where(
            (Event.created_at > after_created_at)
            | ((Event.created_at == after_created_at) & (Event.id > after_event_id))
        )
    statement = statement.order_by(Event.created_at.asc(), Event.id.asc()).limit(limit)
    async with AsyncSessionLocal() as db:
        return list((await db.execute(statement)).all())


async def _rebuild_event(organization_id: uuid.UUID, event_id: uuid.UUID) -> None:
    token = tenant_org_id.set(organization_id)
    try:
        async with AsyncSessionLocal() as db:
            await refresh_event_registration_summary(
                db, organization_id=organization_id, event_id=event_id
            )
            await refresh_event_attendance_summary(
                db, organization_id=organization_id, event_id=event_id
            )
            await refresh_event_payment_summary(
                db, organization_id=organization_id, event_id=event_id
            )
            await refresh_event_speaker_summary(
                db, organization_id=organization_id, event_id=event_id
            )
            await db.commit()
    finally:
        tenant_org_id.reset(token)


async def rebuild(*, limit: int, after_event_id: uuid.UUID | None) -> dict:
    if not 1 <= limit <= 500:
        raise ValueError("limit must be between 1 and 500")

    after_created_at = None
    if after_event_id is not None:
        async with AsyncSessionLocal() as db:
            after_created_at = await db.scalar(
                select(Event.created_at).where(Event.id == after_event_id)
            )
        if after_created_at is None:
            raise ValueError("after_event_id does not identify an event")

    rows = await _event_page(
        after_created_at=after_created_at,
        after_event_id=after_event_id,
        limit=limit,
    )
    rebuilt = 0
    failures: list[dict[str, str]] = []
    for event_id, organization_id, _created_at in rows:
        try:
            await _rebuild_event(organization_id, event_id)
            rebuilt += 1
        except Exception as exc:  # keep the batch resumable and tenant-safe
            failures.append({"event_id": str(event_id), "error_type": type(exc).__name__})

    last = rows[-1] if rows else None
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "requested_limit": limit,
        "selected": len(rows),
        "rebuilt": rebuilt,
        "failures": failures,
        "next_after_event_id": str(last[0]) if last else None,
        "complete": len(rows) < limit,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--after-event-id", type=uuid.UUID, default=None)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    report = asyncio.run(rebuild(limit=args.limit, after_event_id=args.after_event_id))
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 1 if report["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
