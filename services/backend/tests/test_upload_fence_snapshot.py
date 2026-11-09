"""Snapshot membership uses actual PostgreSQL cursors and committed sessions."""
from contextlib import asynccontextmanager
import hashlib
import json
import uuid

import pytest
from sqlalchemy import delete, func, select, text

from app.modules.files.models.file import DurableUpload
from app.modules.platform.models.organization import Organization
from app.modules.registration.services import upload_fence_snapshot as snapshots


def upload(owner, value, status="failed"):
    return DurableUpload(id=value, organization_id=owner, object_key=f"tenant/{owner}/snapshot/{value}.txt",
        storage_bucket="assets", original_filename="private.txt", mime_type="text/plain", size_bytes=1, status=status)


@pytest.mark.asyncio
async def test_streamed_snapshot_excludes_transactions_committed_mid_capture(committed_session_factory, monkeypatch, tmp_path):
    owner = uuid.uuid4()
    start = uuid.uuid4().int & ~0xffff
    original_ids = [uuid.UUID(int=start + value) for value in range(1, 202)]
    late_insert, late_update = uuid.UUID(int=start + 202), uuid.UUID(int=start + 203)
    async with committed_session_factory() as db:
        database = await db.scalar(text("SELECT current_database()"))
        db.add(Organization(id=owner, name="Snapshot concurrency fixture", slug=f"snapshot-{owner.hex}"))
        await db.flush()
        db.add_all([upload(owner, value) for value in original_ids] + [upload(owner, late_update, "ready")])
        await db.commit()

    @asynccontextmanager
    async def sessions(selected):
        assert selected == owner
        async with committed_session_factory() as db:
            yield db

    monkeypatch.setattr(snapshots, "tenant_job_session", sessions)
    write_page = snapshots._write_page
    try:
        async with committed_session_factory() as writer:
            # Both changes exist before capture, but are committed only after
            # its first page. A creation-time cutoff cannot express visibility.
            writer.add(upload(owner, late_insert))
            changed = await writer.get(DurableUpload, late_update)
            changed.status = "failed"
            await writer.flush()

            async def commit_after_first_page(directory, index, payload):
                result = await write_page(directory, index, payload)
                if index == 0:
                    await writer.commit()
                return result

            monkeypatch.setattr(snapshots, "_write_page", commit_after_first_page)
            directory = tmp_path / "snapshot"
            manifest = await snapshots.capture_upload_fence_snapshot(organization_id=owner,
                directory=directory, database=database, build_id="isolated-pg-snapshot-test")
        assert manifest["record_count"] == 201 and manifest["page_count"] == 3
        lines = (directory / "pages.index").read_text().splitlines()
        captured = []
        for index, line in enumerate(lines):
            number, count, digest = line.split()
            ids = snapshots.read_upload_fence_snapshot_page(directory=directory, page_index=index,
                reviewed_sha256=digest, organization_id=owner, database=database)
            assert int(number) == index and len(ids) == int(count) <= 100
            captured.extend(ids)
        assert captured == original_ids and len(set(captured)) == 201
        async with committed_session_factory() as db:
            assert await db.scalar(select(func.count()).select_from(DurableUpload).where(
                DurableUpload.organization_id == owner, DurableUpload.status == "failed")) == 203
    finally:
        async with committed_session_factory() as db:
            await db.execute(delete(DurableUpload).where(DurableUpload.organization_id == owner))
            await db.execute(delete(Organization).where(Organization.id == owner))
            await db.commit()


@pytest.mark.asyncio
async def test_failed_capture_never_publishes_completion_and_does_not_replace_output(db, event, monkeypatch, tmp_path):
    @asynccontextmanager
    async def sessions(owner):
        yield db
    monkeypatch.setattr(snapshots, "tenant_job_session", sessions)
    database = await db.scalar(text("SELECT current_database()"))
    db.add(upload(event.organization_id, uuid.uuid4()))
    await db.flush()
    async def disk_unavailable(*args):
        raise OSError("Owned test disk failure")
    monkeypatch.setattr(snapshots, "_write_page", disk_unavailable)
    directory = tmp_path / "incomplete"
    with pytest.raises(OSError):
        await snapshots.capture_upload_fence_snapshot(organization_id=event.organization_id,
            directory=directory, database=database, build_id="capture-failure-test")
    assert not (directory / "manifest.json").exists()
    with pytest.raises(FileExistsError):
        await snapshots.capture_upload_fence_snapshot(organization_id=event.organization_id,
            directory=directory, database=database, build_id="capture-retry-test")


@pytest.mark.parametrize("defect", ["digest", "foreign", "incomplete", "oversized", "duplicate", "out_of_range", "bad_count", "bad_run"])
def test_snapshot_page_validation_fails_closed(tmp_path, defect):
    owner, run_id = uuid.uuid4(), str(uuid.uuid4())
    manifest = {"schema_version": 1, "complete": True, "run_id": run_id, "organization_id": str(owner),
        "database": "isolated", "page_size": 100, "page_count": 1, "record_count": 1, "build_id": "test"}
    value = str(uuid.uuid4())
    page = {"schema_version": 1, "run_id": run_id, "organization_id": str(owner), "database": "isolated",
        "page_index": 0, "upload_ids": [value, value] if defect == "duplicate" else [value]}
    body = json.dumps(page).encode()
    if defect == "foreign":
        manifest["organization_id"] = str(uuid.uuid4())
    if defect == "incomplete":
        manifest["complete"] = False
    if defect == "bad_count":
        manifest["record_count"] = 200
    if defect == "bad_run":
        manifest["run_id"] = None
    if defect == "oversized":
        body += b" " * snapshots.MAX_FILE_BYTES
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    (tmp_path / "page-00000000.json").write_bytes(body)
    with pytest.raises(ValueError):
        snapshots.read_upload_fence_snapshot_page(directory=tmp_path,
            page_index=1 if defect == "out_of_range" else 0,
            reviewed_sha256="0" * 64 if defect == "digest" else hashlib.sha256(body).hexdigest(),
            organization_id=owner, database="isolated")
