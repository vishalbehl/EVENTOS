from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

from loguru import logger
from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.operational_control import VenueBackupJob, VenueInstallation


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def content_manifest(root: Path) -> dict:
    entries = []
    total = 0
    if root.exists():
        for path in sorted(item for item in root.rglob("*") if item.is_file()):
            size = path.stat().st_size
            total += size
            entries.append({"path": str(path.relative_to(root)), "size_bytes": size, "sha256": file_sha256(path)})
    return {"root": str(root), "file_count": len(entries), "size_bytes": total, "files": entries}


def verify_backup_manifest(root: Path, manifest: dict) -> None:
    """Re-read every artifact before a backup can be marked verified."""
    for entry in manifest.get("files", []):
        path = root / entry["path"]
        if not path.is_file():
            raise RuntimeError(f"Backup verification failed; missing {entry['path']}")
        if path.stat().st_size != entry["size_bytes"] or file_sha256(path) != entry["sha256"]:
            raise RuntimeError(f"Backup verification failed; checksum mismatch for {entry['path']}")
    content = manifest.get("content")
    if content:
        content_root = root / "content"
        for entry in content.get("files", []):
            path = content_root / entry["path"]
            if not path.is_file():
                raise RuntimeError(f"Backup verification failed; missing content {entry['path']}")
            if path.stat().st_size != entry["size_bytes"] or file_sha256(path) != entry["sha256"]:
                raise RuntimeError(f"Backup verification failed; checksum mismatch for content {entry['path']}")


def execute_backup(job_id: str, backup_type: str, destination: str, storage_path: str | None) -> dict:
    target_root = Path(destination).expanduser().resolve()
    target_root.mkdir(parents=True, exist_ok=True)
    job_root = target_root / f"venue-backup-{utcnow().strftime('%Y%m%d-%H%M%S')}-{job_id[:8]}"
    job_root.mkdir(parents=False, exist_ok=False)
    manifest: dict = {"schema_version": 1, "job_id": job_id, "type": backup_type, "created_at": utcnow().isoformat(), "files": []}

    if backup_type in {"full", "database", "emergency"}:
        db_file = job_root / "venue-database.dump"
        database_url = make_url(settings.DATABASE_URL)
        command = ["pg_dump", "--format=custom", "--file", str(db_file), "--host", database_url.host or "127.0.0.1", "--port", str(database_url.port or 5432), "--username", database_url.username or "postgres", database_url.database or "venue_db"]
        process_env = os.environ.copy()
        if database_url.password:
            process_env["PGPASSWORD"] = database_url.password
        completed = __import__("subprocess").run(command, capture_output=True, text=True, timeout=60 * 30, env=process_env)
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.strip() or "pg_dump failed")
        manifest["files"].append({"path": db_file.name, "size_bytes": db_file.stat().st_size, "sha256": file_sha256(db_file)})

    if backup_type in {"full", "content", "emergency"} and storage_path:
        source = Path(storage_path).expanduser().resolve()
        if source.exists():
            content_target = job_root / "content"
            shutil.copytree(source, content_target)
            manifest["content"] = content_manifest(content_target)

    manifest_path = job_root / "manifest.json"
    temporary = job_root / "manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    temporary.replace(manifest_path)
    verify_backup_manifest(job_root, manifest)
    checksum = file_sha256(manifest_path)
    size_bytes = sum(path.stat().st_size for path in job_root.rglob("*") if path.is_file())
    return {"root": str(job_root), "manifest": manifest, "checksum": checksum, "size_bytes": size_bytes}


async def run_backup_worker() -> None:
    # A process termination must leave evidence that the previous job was interrupted.
    async with AsyncSessionLocal() as db:
        interrupted = list((await db.execute(select(VenueBackupJob).where(VenueBackupJob.status == "running"))).scalars().all())
        for job in interrupted:
            job.status = "failed"
            job.error_message = "Backup worker interrupted before completion; retry required."
            job.completed_at = utcnow()
        if interrupted:
            await db.commit()
    while True:
        try:
            async with AsyncSessionLocal() as db:
                job = await db.scalar(
                    select(VenueBackupJob)
                    .where(VenueBackupJob.status == "queued")
                    .order_by(VenueBackupJob.created_at.asc())
                    .with_for_update(skip_locked=True)
                    .limit(1)
                )
                if job:
                    install = await db.scalar(select(VenueInstallation).order_by(VenueInstallation.created_at.asc()).limit(1))
                    job.status = "running"
                    await db.commit()
                    try:
                        result = await asyncio.to_thread(execute_backup, str(job.id), job.backup_type, job.destination, install.storage_path if install else None)
                        job.status = "completed"
                        job.manifest = {**result["manifest"], "root": result["root"]}
                        job.checksum = result["checksum"]
                        job.size_bytes = result["size_bytes"]
                        job.completed_at = utcnow()
                        job.verified_at = utcnow()
                    except Exception as exc:
                        job.status = "failed"
                        job.error_message = str(exc)[:4000]
                        job.completed_at = utcnow()
                    await db.commit()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error(f"Backup worker error: {exc}")
        await asyncio.sleep(10)
