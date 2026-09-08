"""Verify durable import progress reconstruction from a persisted checkpoint."""
from __future__ import annotations

import argparse
import asyncio
import json
import uuid
from pathlib import Path

import app.models  # noqa: F401 - register all relationship targets before queries
from sqlalchemy import select

from app.database import AsyncSessionLocal, SessionLocal
from app.core.job_status_service import JobStatusService
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User  # noqa: F401 - register relationship target
from app.modules.platform.models.organization import Organization
from app.modules.registration.models.import_job import ImportJob


def _scope() -> tuple[uuid.UUID, uuid.UUID]:
    with SessionLocal() as db:
        row = db.execute(
            select(Organization.id, Event.id).join(
                Event, Event.organization_id == Organization.id
            )
        ).first()
        if row is None:
            raise RuntimeError("staging database has no organization/event scope")
        return uuid.UUID(str(row[0])), uuid.UUID(str(row[1]))


def _prepare() -> dict:
    organization_id, event_id = _scope()
    job_id = uuid.uuid4()
    with SessionLocal() as db:
        db.add(ImportJob(
            id=job_id,
            event_id=event_id,
            filename="staging-progress-recovery.xlsx",
            storage_path=f"staging-progress-recovery/{job_id}.xlsx",
            job_type="schedule",
            status="importing",
            rows_total=100,
            rows_imported=30,
            rows_failed=2,
        ))
        db.commit()
    return {
        "job_id": str(job_id),
        "organization_id": str(organization_id),
        "event_id": str(event_id),
        "checkpoint_progress": 32,
    }


async def _status(job_id: uuid.UUID, organization_id: uuid.UUID) -> dict:
    async with AsyncSessionLocal() as db:
        result = await JobStatusService.import_job(db, job_id, organization_id)
    return result.model_dump(mode="json")


def _cleanup(job_id: uuid.UUID) -> None:
    with SessionLocal() as db:
        row = db.query(ImportJob).filter(ImportJob.id == job_id).one_or_none()
        if row is not None:
            db.delete(row)
            db.commit()


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--prepare", action="store_true")
    mode.add_argument("--verify", action="store_true")
    parser.add_argument("--job-id")
    parser.add_argument("--organization-id")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.prepare:
        report = _prepare()
    else:
        if not args.job_id or not args.organization_id:
            raise SystemExit("--verify requires --job-id and --organization-id")
        job_id = uuid.UUID(args.job_id)
        try:
            observed = asyncio.run(_status(job_id, uuid.UUID(args.organization_id)))
            report = {
                "job_id": args.job_id,
                "organization_id": args.organization_id,
                "observed": observed,
                "passed": observed["status"] == "importing" and observed["progress"] == 32,
            }
        finally:
            # The row is synthetic; never leave it behind when a status read
            # fails, including mapper or database-connection failures.
            _cleanup(job_id)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report.get("passed", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
