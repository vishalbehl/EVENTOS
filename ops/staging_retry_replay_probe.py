"""Exercise retry exhaustion and operator replay idempotency in staging.

The probe deliberately creates one disposable upload whose object is absent.
The real files worker therefore follows its normal retry policy and persists a
terminal failure before the probe removes the synthetic upload row. The replay
command is then exercised against the durable failure record with Celery
dispatch captured, so the probe cannot start a second provider operation.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from celery.result import AsyncResult
from sqlalchemy import select

from app.database import AsyncSessionLocal, SessionLocal
from app.modules.events.models.event import Event  # noqa: F401 - model registration
from app.modules.files.models.file import DurableUpload
from app.modules.identity.models.user import User
from app.modules.operations_control.application.commands import OperationsControlCommandService
from app.modules.operations_control.models import TaskFailure
from app.modules.platform.models.organization import Organization
from app.tasks.upload_jobs import process_durable_upload
from app.worker import celery_app


def _first_scope() -> tuple[uuid.UUID, uuid.UUID]:
    with SessionLocal() as db:
        row = db.query(Organization.id).first()
        if row is None:
            raise RuntimeError("staging database has no organization")
        return uuid.UUID(str(row[0])), uuid.uuid4()


def _create_probe_upload(organization_id: uuid.UUID, upload_id: uuid.UUID) -> None:
    with SessionLocal() as db:
        db.add(DurableUpload(
            id=upload_id,
            organization_id=organization_id,
            object_key=f"staging-retry-probe/{upload_id}.missing",
            storage_bucket="assets",
            original_filename="retry-probe.pdf",
            mime_type="application/pdf",
            size_bytes=32,
            checksum=None,
            status="uploaded",
        ))
        db.commit()


def _read_failure(task_id: str) -> tuple[TaskFailure | None, str | None]:
    with SessionLocal() as db:
        failure = db.query(TaskFailure).filter(TaskFailure.task_id == task_id).one_or_none()
        upload = db.query(DurableUpload).filter(DurableUpload.task_id == task_id).one_or_none()
        return failure, upload.status if upload else None


def _remove_probe_upload(upload_id: uuid.UUID) -> None:
    with SessionLocal() as db:
        row = db.query(DurableUpload).filter(DurableUpload.id == upload_id).one_or_none()
        if row is not None:
            db.delete(row)
            db.commit()


async def _exercise_replay(
    *, failure_id: uuid.UUID, organization_id: uuid.UUID, task_name: str
) -> dict:
    async with AsyncSessionLocal() as db:
        actor = await db.scalar(
            select(User)
            .where(User.organization_id == organization_id, User.is_active.is_(True))
            .order_by(User.created_at.asc(), User.id.asc())
            .limit(1)
        )
        if actor is None:
            raise RuntimeError("staging organization has no active replay actor")
        service = OperationsControlCommandService(db)
        reason = "Staging retry-exhaustion replay verification"
        key = f"staging-retry-replay-{uuid.uuid4()}"
        first = await service.replay_task_failure(
            actor=actor,
            failure_id=failure_id,
            organization_id=organization_id,
            reason=reason,
            idempotency_key=key,
        )
        second = await service.replay_task_failure(
            actor=actor,
            failure_id=failure_id,
            organization_id=organization_id,
            reason=reason,
            idempotency_key=key,
        )

    successor_id = str(first["job_id"])
    replay_result = AsyncResult(successor_id, app=celery_app)
    deadline = time.monotonic() + 45
    while replay_result.state not in {"SUCCESS", "FAILURE", "REVOKED"} and time.monotonic() < deadline:
        await asyncio.sleep(2)
        replay_result = AsyncResult(successor_id, app=celery_app)
    return {
        "first": first,
        "second": second,
        "successor_task_id": successor_id,
        "execution_state": replay_result.state,
        "execution_result": replay_result.result if replay_result.state == "SUCCESS" else None,
        "task_name_expected": task_name,
    }


def _exercise_duplicate_delivery(
    *, upload_id: uuid.UUID, organization_id: uuid.UUID, task_id: str
) -> dict:
    """Submit two late-ack messages for one terminal upload and compare outcome."""
    for _ in range(2):
        celery_app.send_task(
            "app.tasks.process_durable_upload",
            args=[str(upload_id), str(organization_id)],
            queue="files",
            task_id=task_id,
            headers={"tenant_org_id": str(organization_id)},
        )
    result = AsyncResult(task_id, app=celery_app)
    deadline = time.monotonic() + 30
    while result.state not in {"SUCCESS", "FAILURE", "REVOKED"} and time.monotonic() < deadline:
        time.sleep(1)
        result = AsyncResult(task_id, app=celery_app)
    return {
        "messages_submitted": 2,
        "same_task_id": True,
        "task_id": task_id,
        "execution_state": result.state,
        "execution_result": result.result if result.state == "SUCCESS" else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument("--timeout-seconds", type=int, default=180)
    args = parser.parse_args()
    if not 30 <= args.timeout_seconds <= 600:
        raise SystemExit("timeout-seconds must be between 30 and 600")

    organization_id, upload_id = _first_scope()
    _create_probe_upload(organization_id, upload_id)
    task_id = f"staging-retry-probe-{uuid.uuid4()}"
    started = time.monotonic()
    result = process_durable_upload.apply_async(
        args=[str(upload_id), str(organization_id)],
        task_id=task_id,
        queue="files",
        headers={"tenant_org_id": str(organization_id)},
    )
    deadline = time.monotonic() + args.timeout_seconds
    while result.state not in {"SUCCESS", "FAILURE", "REVOKED"} and time.monotonic() < deadline:
        time.sleep(2)
        result = AsyncResult(task_id, app=celery_app)

    failure, upload_status = _read_failure(task_id)
    if result.state != "FAILURE" or failure is None:
        _remove_probe_upload(upload_id)
        raise SystemExit(
            f"retry probe did not reach durable terminal failure: celery={result.state} durable={bool(failure)}"
        )
    replay = asyncio.run(_exercise_replay(
        failure_id=failure.id,
        organization_id=organization_id,
        task_name=failure.task_name,
    ))
    duplicate = _exercise_duplicate_delivery(
        upload_id=upload_id,
        organization_id=organization_id,
        task_id=f"staging-duplicate-delivery-{uuid.uuid4()}",
    )
    _remove_probe_upload(upload_id)

    report = {
        "probe": "retry_exhaustion_and_replay_idempotency",
        "organization_id": str(organization_id),
        "task_id": task_id,
        "task_name": failure.task_name,
        "queue": "files",
        "celery_state": result.state,
        "retry_count": failure.retry_count,
        "durable_failure_status": failure.status,
        "durable_upload_status_before_cleanup": upload_status,
        "replay_payload_present": bool(failure.replay_queue and failure.replay_args),
        "replay": replay,
        "duplicate_delivery": duplicate,
        "elapsed_seconds": round(time.monotonic() - started, 2),
        "synthetic_upload_removed": True,
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }
    report["passed"] = bool(
        result.state == "FAILURE"
        and failure.status == "FAILED"
        and failure.retry_count >= 3
        and failure.replay_queue == "files"
        and replay["first"]["replayed"] is False
        and replay["second"]["replayed"] is True
        and replay["first"]["job_id"] == replay["second"]["job_id"]
        and replay["execution_state"] == "SUCCESS"
        and isinstance(replay["execution_result"], dict)
        and replay["execution_result"].get("idempotent") is True
        and duplicate["messages_submitted"] == 2
        and duplicate["same_task_id"] is True
        and duplicate["execution_state"] == "SUCCESS"
        and isinstance(duplicate["execution_result"], dict)
        and duplicate["execution_result"].get("idempotent") is True
    )
    rendered = json.dumps(report, indent=2, sort_keys=True, default=str)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
