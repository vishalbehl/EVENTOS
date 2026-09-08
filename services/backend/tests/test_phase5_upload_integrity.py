from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import app.tasks.upload_jobs as upload_jobs
from app.core.antivirus import ScanResult
from app.core.upload_validation import validate_file_signature as real_validate_file_signature


class _Session:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0
        self.flushes = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1

    async def flush(self):
        self.flushes += 1


class _SessionFactory:
    def __init__(self, session: _Session) -> None:
        self.session = session

    def __call__(self):
        return self.session


class _Repository:
    row = None
    calls: list[dict[str, object]] = []

    def __init__(self, _db):
        pass

    async def get_by_id(self, **kwargs):
        self.calls.append(kwargs)
        return self.row


def _row(*, status: str = "uploaded", checksum: str | None = None, size: int = 8):
    return SimpleNamespace(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        object_key="tenant/object.bin",
        storage_bucket="assets",
        size_bytes=size,
        checksum=checksum,
        mime_type="application/pdf",
        status=status,
        task_id=None,
        processing_error=None,
    )


def _install(monkeypatch, row, *, metadata=None, chunks=b"%PDF-1.7", scan=None):
    session = _Session()
    _Repository.row = row
    _Repository.calls = []
    transitions: list[tuple[str, str]] = []

    async def transition(_db, current, target, **_kwargs):
        transitions.append((current.status, target))
        current.status = target
        return current

    monkeypatch.setattr(upload_jobs, "AsyncSessionLocal", _SessionFactory(session))
    monkeypatch.setattr(upload_jobs, "DurableUploadRepository", _Repository)
    monkeypatch.setattr(upload_jobs.UploadService, "apply_transition", transition)
    monkeypatch.setattr(
        upload_jobs,
        "get_object_metadata",
        lambda **_kwargs: {"size": len(chunks) if metadata is None else metadata},
    )
    monkeypatch.setattr(upload_jobs, "iter_object_chunks", lambda *_args, **_kwargs: iter((chunks,)))
    monkeypatch.setattr(upload_jobs, "scan_chunks", lambda _chunks: scan or ScanResult("clean"))
    return session, transitions


@pytest.mark.asyncio
async def test_upload_integrity_matrix_quarantines_size_checksum_signature_and_malware(monkeypatch):
    organization_id = uuid.uuid4()

    row = _row(size=99)
    session, transitions = _install(monkeypatch, row, metadata=8)
    result = await upload_jobs._process(row.id, organization_id, "size-task")
    assert result["status"] == "quarantined"
    assert transitions[-1] == ("uploaded", "quarantined")
    assert session.commits == 1

    row = _row(checksum="0" * 64)
    session, transitions = _install(monkeypatch, row)
    result = await upload_jobs._process(row.id, organization_id, "checksum-task")
    assert result["status"] == "quarantined"
    assert transitions[-1] == ("uploaded", "quarantined")
    assert session.commits == 1

    row = _row()
    session, transitions = _install(monkeypatch, row)

    def reject_signature(_data, _mime):
        raise HTTPException(status_code=415, detail={"code": "FILE_SIGNATURE_MISMATCH"})

    monkeypatch.setattr(upload_jobs, "validate_file_signature", reject_signature)
    result = await upload_jobs._process(row.id, organization_id, "signature-task")
    assert result["status"] == "quarantined"
    assert transitions[-1] == ("verifying", "quarantined")
    assert session.commits == 1

    row = _row()
    session, transitions = _install(monkeypatch, row, scan=ScanResult("infected", "EICAR"))
    monkeypatch.setattr(upload_jobs, "validate_file_signature", real_validate_file_signature)
    result = await upload_jobs._process(row.id, organization_id, "malware-task")
    assert result["status"] == "quarantined"
    assert transitions[-1] == ("scanning", "quarantined")
    assert session.commits == 1


@pytest.mark.asyncio
async def test_upload_storage_and_antivirus_outages_rollback_and_remain_retryable(monkeypatch):
    organization_id = uuid.uuid4()
    row = _row()
    session, transitions = _install(monkeypatch, row)

    def storage_timeout(**_kwargs):
        raise TimeoutError("object storage timeout")

    monkeypatch.setattr(upload_jobs, "get_object_metadata", storage_timeout)
    with pytest.raises(TimeoutError):
        await upload_jobs._process(row.id, organization_id, "storage-timeout")
    assert session.rollbacks == 1
    assert row.status == "uploaded"
    assert transitions == [("uploaded", "uploaded")]

    row = _row()
    session, transitions = _install(monkeypatch, row, scan=ScanResult("unavailable"))
    monkeypatch.setattr(upload_jobs.settings, "ANTIVIRUS_REQUIRED", True)
    with pytest.raises(RuntimeError, match="temporarily unavailable"):
        await upload_jobs._process(row.id, organization_id, "scanner-timeout")
    assert session.rollbacks == 1
    assert row.status == "scanning"
    assert transitions[-1] == ("verifying", "scanning")


@pytest.mark.asyncio
async def test_upload_missing_and_cross_tenant_reads_never_touch_storage(monkeypatch):
    organization_id = uuid.uuid4()
    row = _row(status="ready")
    session, _transitions = _install(monkeypatch, row)
    metadata_calls = 0

    def unexpected_metadata(**_kwargs):
        nonlocal metadata_calls
        metadata_calls += 1
        raise AssertionError("terminal upload must not access object storage")

    monkeypatch.setattr(upload_jobs, "get_object_metadata", unexpected_metadata)
    result = await upload_jobs._process(row.id, organization_id, "duplicate-completion")
    assert result == {"upload_id": str(row.id), "status": "ready", "idempotent": True}
    assert metadata_calls == 0
    assert session.commits == 0

    _Repository.row = None
    cross_tenant_organization_id = uuid.uuid4()
    result = await upload_jobs._process(uuid.uuid4(), cross_tenant_organization_id, "cross-tenant")
    assert result["status"] == "missing"
    assert metadata_calls == 0
    assert _Repository.calls[-1]["organization_id"] == cross_tenant_organization_id
