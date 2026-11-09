"""Read-only, bounded-memory capture of a fixed upload-reconciliation cohort.

One streamed SELECT establishes membership. No provider operations or business
writes occur while its cursor/transaction is held. The final manifest is written
only after the cursor and tenant session have closed successfully.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import uuid

from sqlalchemy import select, text

from app.modules.files.models.file import DurableUpload
from app.tasks.tenant_job_scope import parse_required_organization_id, tenant_job_session

PAGE_SIZE = 100
MAX_FILE_BYTES = 32768


def _write_json(path: Path, payload: dict) -> str:
    body = (json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    if len(body) > MAX_FILE_BYTES:
        raise ValueError("Snapshot artifact exceeds its bounded file size.")
    with path.open("xb") as handle:
        handle.write(body)
        handle.flush()
        os.fsync(handle.fileno())
    return hashlib.sha256(body).hexdigest()


async def _write_page(directory: Path, index: int, payload: dict) -> str:
    return await asyncio.to_thread(_write_json, directory / f"page-{index:08d}.json", payload)


async def capture_upload_fence_snapshot(*, organization_id: uuid.UUID, directory: Path,
        database: str, build_id: str, timeout_seconds: int = 120) -> dict:
    organization_id = parse_required_organization_id(organization_id)
    directory = Path(directory)
    if (isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, int)
            or not 1 <= timeout_seconds <= 300):
        raise ValueError("Snapshot time budget must be between 1 and 300 seconds.")
    if not isinstance(database, str) or not 1 <= len(database) <= 128:
        raise ValueError("Expected database is required.")
    if not isinstance(build_id, str) or not 1 <= len(build_id) <= 160:
        raise ValueError("Build identity is required.")
    # Exclusive directory creation, no replacement or recursive cleanup. Failed
    # captures remain diagnosable and have no completion manifest.
    directory.mkdir(exist_ok=False)
    run_id = str(uuid.uuid4())
    page_count = record_count = 0
    page_digest = hashlib.sha256()
    async with asyncio.timeout(timeout_seconds):
        async with tenant_job_session(organization_id) as db:
            actual_database = await db.scalar(text("SELECT current_database()"))
            if actual_database != database:
                raise ValueError("Snapshot database does not match the expected database.")
            await db.execute(text("SET LOCAL statement_timeout = '60s'"))
            result = await db.stream_scalars(select(DurableUpload.id).where(
                DurableUpload.organization_id == organization_id,
                DurableUpload.status == "failed",
            ).order_by(DurableUpload.id).execution_options(yield_per=PAGE_SIZE))
            try:
                async for ids in result.partitions(PAGE_SIZE):
                    payload = {"schema_version": 1, "run_id": run_id,
                        "organization_id": str(organization_id), "database": database,
                        "page_index": page_count, "upload_ids": [str(value) for value in ids]}
                    digest = await _write_page(directory, page_count, payload)
                    # Append-only fixed-size page index. This is evidence, not a
                    # source of authority: apply also requires a reviewed digest.
                    index_entry = f"{page_count:08d} {len(ids):03d} {digest}\n".encode("ascii")
                    def append_index(entry=index_entry):
                        with (directory / "pages.index").open("ab") as handle:
                            handle.write(entry)
                            handle.flush()
                            os.fsync(handle.fileno())
                    await asyncio.to_thread(append_index)
                    page_digest.update(index_entry)
                    page_count += 1
                    record_count += len(ids)
            finally:
                await result.close()
    manifest = {"schema_version": 1, "complete": True, "run_id": run_id,
        "organization_id": str(organization_id), "database": database, "build_id": build_id,
        "page_size": PAGE_SIZE, "page_count": page_count, "record_count": record_count,
        "index_sha256": page_digest.hexdigest(), "provider_io_performed": False}
    await asyncio.to_thread(_write_json, directory / "manifest.json", manifest)
    return manifest


def read_upload_fence_snapshot_page(*, directory: Path, page_index: int,
        reviewed_sha256: str, organization_id: uuid.UUID, database: str) -> tuple[uuid.UUID, ...]:
    """O(page size) validated selection, independent of total snapshot size.

    The digest must come from the reviewed page index through the normal
    approval process, not be computed from the selected file to bypass review.
    Checksums detect corruption; database ownership/audits remain authoritative.
    """
    organization_id = parse_required_organization_id(organization_id)
    if isinstance(page_index, bool) or not isinstance(page_index, int) or not 0 <= page_index < 100_000_000:
        raise ValueError("Invalid snapshot page index.")
    if not isinstance(reviewed_sha256, str) or re.fullmatch(r"[0-9a-f]{64}", reviewed_sha256) is None:
        raise ValueError("A reviewed lowercase SHA-256 page digest is required.")

    def read_bounded(path):
        if path.is_symlink():
            raise ValueError("Snapshot files must not be symbolic links.")
        with path.open("rb") as handle:
            body = handle.read(MAX_FILE_BYTES + 1)
        if len(body) > MAX_FILE_BYTES:
            raise ValueError("Snapshot file exceeds its bounded size.")
        return body

    directory = Path(directory)
    manifest = json.loads(read_bounded(directory / "manifest.json"))
    if (not isinstance(manifest, dict) or manifest.get("schema_version") != 1
            or manifest.get("complete") is not True or manifest.get("page_size") != PAGE_SIZE
            or manifest.get("organization_id") != str(organization_id) or manifest.get("database") != database
            or type(manifest.get("page_count")) is not int or not 0 <= page_index < manifest["page_count"]):
        raise ValueError("Snapshot is incomplete, foreign or has an invalid page boundary.")
    try:
        run_id = str(uuid.UUID(manifest["run_id"]))
    except (ValueError, TypeError, KeyError, AttributeError) as exc:
        raise ValueError("Snapshot requires a valid run identity.") from exc
    if (manifest["run_id"] != run_id or type(manifest.get("record_count")) is not int
            or manifest["record_count"] < 0
            or manifest["page_count"] != (manifest["record_count"] + PAGE_SIZE - 1) // PAGE_SIZE):
        raise ValueError("Snapshot counts or run identity are inconsistent.")
    body = read_bounded(directory / f"page-{page_index:08d}.json")
    if hashlib.sha256(body).hexdigest() != reviewed_sha256:
        raise ValueError("Snapshot page differs from its reviewed digest.")
    page = json.loads(body)
    if (not isinstance(page, dict) or page.get("schema_version") != 1
            or page.get("run_id") != run_id or type(page.get("page_index")) is not int or page["page_index"] != page_index
            or page.get("organization_id") != str(organization_id) or page.get("database") != database
            or not isinstance(page.get("upload_ids"), list) or not 1 <= len(page["upload_ids"]) <= PAGE_SIZE):
        raise ValueError("Snapshot page is inconsistent with its completed manifest.")
    expected_count = min(PAGE_SIZE, manifest["record_count"] - page_index * PAGE_SIZE)
    if len(page["upload_ids"]) != expected_count:
        raise ValueError("Snapshot page does not match its recorded row count.")
    try:
        ids = tuple(uuid.UUID(value) for value in page["upload_ids"] if isinstance(value, str))
    except ValueError as exc:
        raise ValueError("Snapshot has invalid upload identifiers.") from exc
    if len(ids) != len(page["upload_ids"]) or len(set(ids)) != len(ids):
        raise ValueError("Snapshot identifiers must be distinct UUIDs.")
    return ids
