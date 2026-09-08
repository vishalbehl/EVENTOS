"""Exercise the real staging object-storage and antivirus upload boundary.

The probe creates only disposable tenant-scoped DurableUpload rows and removes
both rows and objects in a finally block. It emits statuses and reason classes,
never file contents or tenant-sensitive payloads.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import json
import uuid
import zipfile
from pathlib import Path

import app.models  # noqa: F401 - register the model graph before ORM use
from app.database import SessionLocal
from app.modules.files.models.file import DurableUpload
from app.modules.platform.models.organization import Organization
from app.modules.presentations.services.upload_service import delete_object, upload_bytes
from app.tasks.upload_jobs import _process


BUCKET = "assets"


def _scope() -> tuple[uuid.UUID, uuid.UUID]:
    with SessionLocal() as db:
        rows = (
            db.query(Organization.id)
            .filter(Organization.is_active.is_(True))
            .order_by(Organization.created_at.asc(), Organization.id.asc())
            .limit(2)
            .all()
        )
    if not rows:
        raise RuntimeError("No active organization is available")
    first = uuid.UUID(str(rows[0][0]))
    second = uuid.UUID(str(rows[1][0])) if len(rows) > 1 else uuid.uuid4()
    return first, second


def _create_row(
    organization_id: uuid.UUID,
    key: str,
    payload: bytes,
    *,
    checksum: str | None = None,
    size_bytes: int | None = None,
) -> uuid.UUID:
    upload_id = uuid.uuid4()
    with SessionLocal() as db:
        db.add(
            DurableUpload(
                id=upload_id,
                organization_id=organization_id,
                object_key=key,
                storage_bucket=BUCKET,
                original_filename="phase5-probe.pdf",
                mime_type="application/pdf",
                size_bytes=len(payload) if size_bytes is None else size_bytes,
                checksum=checksum,
                status="uploaded",
            )
        )
        db.commit()
    if payload:
        upload_bytes(BUCKET, key, payload, "application/pdf", verified_organization_id=organization_id)
    return upload_id


def _cleanup(upload_id: uuid.UUID, key: str) -> None:
    try:
        delete_object(BUCKET, key)
    finally:
        with SessionLocal() as db:
            row = db.query(DurableUpload).filter(DurableUpload.id == upload_id).one_or_none()
            if row is not None:
                db.delete(row)
                db.commit()


async def _run(upload_id: uuid.UUID, organization_id: uuid.UUID, task_id: str) -> dict:
    try:
        return await _process(upload_id, organization_id, task_id)
    except Exception as exc:
        # The task wrapper records the terminal failure and then re-raises so
        # Celery can persist the durable failure event. Inspect that state here
        # rather than treating the expected task exception as probe failure.
        with SessionLocal() as db:
            row = db.query(DurableUpload).filter(DurableUpload.id == upload_id).one_or_none()
            status = row.status if row is not None else "missing"
        return {"upload_id": str(upload_id), "status": status, "error_type": type(exc).__name__}


def main(output: Path | None = None) -> int:
    organization_id, other_organization_id = _scope()
    prefix = f"{organization_id}/phase5-integrity/{uuid.uuid4()}"
    clean = b"%PDF-1.7\nphase5-clean-upload\n"
    mismatch = b"%PDF-1.7\nphase5-checksum-mismatch\n"
    invalid_signature = b"not a pdf object\n"
    eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    eicar_buffer = io.BytesIO()
    with zipfile.ZipFile(eicar_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", b"<?xml version=\"1.0\"?>")
        archive.writestr("docProps/core.xml", eicar)

    cases: list[dict[str, object]] = []
    created: list[tuple[uuid.UUID, str]] = []
    runner = asyncio.Runner()

    def case(name: str, payload: bytes, **kwargs) -> tuple[uuid.UUID, str]:
        key = f"{prefix}/{name}.bin"
        upload_id = _create_row(organization_id, key, payload, **kwargs)
        created.append((upload_id, key))
        return upload_id, key

    try:
        upload_id, _ = case("clean", clean, checksum=hashlib.sha256(clean).hexdigest())
        cases.append({"case": "clean_object", "observed": runner.run(_run(upload_id, organization_id, "phase5-clean"))})

        upload_id, _ = case("checksum", mismatch, checksum=hashlib.sha256(b"different").hexdigest())
        cases.append({"case": "checksum_mismatch", "observed": runner.run(_run(upload_id, organization_id, "phase5-checksum"))})

        upload_id, _ = case("signature", invalid_signature)
        cases.append({"case": "file_signature_mismatch", "observed": runner.run(_run(upload_id, organization_id, "phase5-signature"))})

        # This is a valid ZIP-based office container so signature validation
        # passes and the real ClamAV service receives the EICAR test signature.
        upload_id, key = case("malware", eicar_buffer.getvalue())
        with SessionLocal() as db:
            row = db.query(DurableUpload).filter(DurableUpload.id == upload_id).one()
            row.original_filename = "phase5-probe.pptx"
            row.mime_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            db.commit()
        # The object was uploaded with the same bytes; only the declared MIME
        # metadata is changed before processing.
        cases.append({"case": "antivirus_malware", "observed": runner.run(_run(upload_id, organization_id, "phase5-malware"))})

        upload_id, _ = case("missing", b"")
        cases.append({"case": "missing_object", "observed": runner.run(_run(upload_id, organization_id, "phase5-missing"))})

        upload_id, _ = case("cross-tenant", clean, checksum=hashlib.sha256(clean).hexdigest())
        cases.append({"case": "cross_tenant_access", "observed": runner.run(_run(upload_id, other_organization_id, "phase5-cross-tenant"))})
    finally:
        for upload_id, key in created:
            _cleanup(upload_id, key)
        runner.close()

    expected = {
        "clean_object": "ready",
        "checksum_mismatch": "quarantined",
        "file_signature_mismatch": "quarantined",
        "antivirus_malware": "quarantined",
        "missing_object": "failed",
        "cross_tenant_access": "missing",
    }
    report = {
        "cases": cases,
        "object_storage": "real-staging",
        "antivirus": "real-staging",
        "passed": all(row["observed"].get("status") == expected[row["case"]] for row in cases),
    }
    rendered = json.dumps(report, indent=2, sort_keys=True, default=str)
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    raise SystemExit(main(args.output))
