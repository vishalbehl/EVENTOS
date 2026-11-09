"""Real local object IO and ClamAV; no scanner/storage response doubles."""
from contextlib import asynccontextmanager
import hashlib
import json
import os
import secrets
import subprocess
import time
import uuid
import io
import socket

import boto3
from botocore.config import Config
import pytest

from app.config import settings
from app.modules.files.models.file import DurableUpload
from app.modules.presentations.services import upload_service as storage


@pytest.fixture
def live_scanner():
    """Require the actual scanner protocol, not container-started optimism."""
    deadline = time.monotonic() + 45
    while True:
        try:
            with socket.create_connection(("127.0.0.1", 3310), timeout=1) as connection:
                connection.sendall(b"zPING\0")
                if connection.recv(32).strip(b"\0\r\n ") == b"PONG":
                    return
        except OSError:
            pass
        if time.monotonic() >= deadline:
            pytest.fail("Real local ClamAV did not become ready within 45 seconds; no scan is mocked or skipped")
        time.sleep(0.25)


@pytest.fixture(scope="module")
def isolated_minio():
    """Disposable loopback-only provider; no existing bucket or volume is used."""
    image = subprocess.run(["docker", "inspect", "conf-platform-cloud-minio-1",
        "--format", "{{.Image}}"], check=True, capture_output=True, text=True,
        timeout=10).stdout.strip()
    assert image.startswith("sha256:")
    name = "category-a-storage-test-" + uuid.uuid4().hex
    username, password = "categoryatest", secrets.token_urlsafe(32)
    environment = {**os.environ, "MINIO_ROOT_USER": username, "MINIO_ROOT_PASSWORD": password}
    container_id = subprocess.run(["docker", "run", "--detach", "--rm", "--name", name,
        "--publish", "127.0.0.1::9000", "--env", "MINIO_ROOT_USER", "--env", "MINIO_ROOT_PASSWORD",
        image, "server", "/data"], env=environment, check=True, capture_output=True,
        text=True, timeout=20).stdout.strip()
    try:
        ports = json.loads(subprocess.run(["docker", "inspect", container_id,
            "--format", "{{json .NetworkSettings.Ports}}"], check=True,
            capture_output=True, text=True, timeout=10).stdout)
        binding = ports["9000/tcp"][0]
        assert binding["HostIp"] == "127.0.0.1"
        endpoint = f"http://127.0.0.1:{int(binding['HostPort'])}"
        client = boto3.client("s3", endpoint_url=endpoint, aws_access_key_id=username,
            aws_secret_access_key=password, region_name="us-east-1",
            config=Config(connect_timeout=1, read_timeout=1, retries={"max_attempts": 0},
                s3={"addressing_style": "path"}))
        deadline = time.monotonic() + 30
        while True:
            try:
                client.list_buckets()
                break
            except Exception:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.25)
        client.create_bucket(Bucket=settings.S3_BUCKET_REGISTRATION_UPLOADS)
        yield endpoint, username, password
        client.close()
    finally:
        # Exact ID of the disposable no-volume container created above only.
        subprocess.run(["docker", "stop", "--time", "3", container_id],
            check=True, capture_output=True, text=True, timeout=15)


@pytest.fixture
def object_storage(isolated_minio, monkeypatch):
    endpoint, username, password = isolated_minio
    monkeypatch.setattr(settings, "STORAGE_MODE", "s3")
    monkeypatch.setattr(settings, "S3_ENDPOINT_URL", endpoint)
    monkeypatch.setattr(settings, "S3_ACCESS_KEY_ID", username)
    monkeypatch.setattr(settings, "S3_SECRET_ACCESS_KEY", password)
    monkeypatch.setattr(settings, "S3_REGION", "us-east-1")
    monkeypatch.setattr(settings, "S3_FORCE_PATH_STYLE", True)
    monkeypatch.setattr(settings, "ANTIVIRUS_COMMAND", "tcp://127.0.0.1:3310")
    monkeypatch.setattr(settings, "ANTIVIRUS_REQUIRED", True)
    monkeypatch.setattr(settings, "ANTIVIRUS_TIMEOUT_SECONDS", 5)


@pytest.fixture
def local_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_MODE", "local")
    monkeypatch.setattr(storage, "LOCAL_STORAGE_ROOT", tmp_path)
    monkeypatch.setattr(settings, "ANTIVIRUS_COMMAND", "tcp://127.0.0.1:3310")
    monkeypatch.setattr(settings, "ANTIVIRUS_REQUIRED", True)
    monkeypatch.setattr(settings, "ANTIVIRUS_TIMEOUT_SECONDS", 5)
    return tmp_path


@pytest.mark.parametrize("key_kind", ["foreign", "traversal", "backslash"])
def test_storage_cleanup_rejects_foreign_and_noncanonical_keys(local_storage, key_kind):
    owner, other = uuid.uuid4(), uuid.uuid4()
    key = f"tenant/{other}/evidence.txt"
    storage.upload_bytes("assets", key, b"retained test object", verified_organization_id=other)
    attempted = {"foreign": key,
        "traversal": f"tenant/{owner}/../{other}/evidence.txt",
        "backslash": f"tenant/{owner}/..\\{other}/evidence.txt"}[key_kind]
    with pytest.raises(RuntimeError):
        storage.delete_object("assets", attempted, verified_organization_id=owner)
    assert (local_storage / "assets" / key).read_bytes() == b"retained test object"


@pytest.mark.parametrize("present", [False, True])
def test_real_provider_fence_blocks_delayed_conditional_registration_put(object_storage, present):
    owner, event_id = uuid.uuid4(), uuid.uuid4()
    bucket = settings.S3_BUCKET_REGISTRATION_UPLOADS
    key = f"tenant/{owner}/event/{event_id}/registration_upload/proof/{uuid.uuid4()}.pdf"
    payload = b"%PDF-1.4\nConditional storage invariant\n"
    digest = hashlib.sha256(payload).hexdigest()
    def put(data=payload):
        storage.upload_fileobj(bucket, key, io.BytesIO(data), "application/pdf",
            verified_organization_id=owner, write_once=True, expected_checksum=hashlib.sha256(data).hexdigest())
    if present:
        put()
        put()  # A lost-success retry verifies and retains the same stored bytes.
        assert b"".join(storage.iter_object_chunks(bucket, key, verified_organization_id=owner)) == payload
        with pytest.raises(storage.RegistrationUploadWriteConflict):
            put(payload + b"different")
        assert b"".join(storage.iter_object_chunks(bucket, key, verified_organization_id=owner)) == payload
    storage.seal_registration_upload_key(bucket, key, verified_organization_id=owner)
    storage.seal_registration_upload_key(bucket, key, verified_organization_id=owner)
    client = storage._get_s3_client()
    try:
        marker = client.head_object(Bucket=bucket, Key=key)
        assert marker["ContentLength"] == 0
        assert marker["Metadata"]["conf-platform-cleanup-fence"] == "v1"
        body = client.get_object(Bucket=bucket, Key=key)["Body"]
        try:
            assert body.read() == b""
        finally:
            body.close()
    finally:
        client.close()
    with pytest.raises(FileNotFoundError):
        storage.get_object_metadata(bucket=bucket, storage_path=key, verified_organization_id=owner)
    with pytest.raises(storage.RegistrationUploadWriteConflict):
        put()
    with pytest.raises(ValueError, match="must be conditional"):
        storage.upload_fileobj(bucket, key, io.BytesIO(payload), verified_organization_id=owner)
    assert b"".join(storage.iter_object_chunks(bucket, key, verified_organization_id=owner)) == b""


@pytest.mark.parametrize("operation", ["copy", "move_source", "move_target"])
def test_generic_storage_operations_cannot_bypass_managed_attempt_fence(local_storage, operation):
    owner, event_id = uuid.uuid4(), uuid.uuid4()
    key = f"tenant/{owner}/event/{event_id}/registration_upload/proof/{uuid.uuid4()}.pdf"
    ordinary_key = f"tenant/{owner}/ordinary.pdf"
    bucket = settings.S3_BUCKET_REGISTRATION_UPLOADS
    storage.seal_registration_upload_key(bucket, key, verified_organization_id=owner)
    storage.upload_bytes(bucket, ordinary_key, b"retained ordinary payload", verified_organization_id=owner)
    with pytest.raises(RuntimeError, match="Managed registration attempt keys"):
        if operation == "copy":
            storage.copy_object(bucket, ordinary_key, bucket, key)
        elif operation == "move_source":
            storage.move_object(bucket, key, bucket, ordinary_key)
        else:
            storage.move_object(bucket, ordinary_key, bucket, key)
    assert (local_storage / bucket / key).read_bytes() == b""
    assert (local_storage / bucket / ordinary_key).read_bytes() == b"retained ordinary payload"


@pytest.mark.asyncio
@pytest.mark.parametrize("infected", [False, True])
async def test_real_scan_moves_only_clean_object_to_ready(db, event, object_storage, monkeypatch, infected, live_scanner):
    from app.tasks import upload_jobs, tenant_job_scope
    # EICAR is an inert industry antivirus test string, not executable malware.
    data = (b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
        if infected else b"Category A clean upload integration fixture.\n")
    key = f"tenant/{event.organization_id}/event/{event.id}/registration_upload/document/{uuid.uuid4()}.txt"
    row = DurableUpload(organization_id=event.organization_id, event_id=event.id,
        object_key=key, storage_bucket=settings.S3_BUCKET_REGISTRATION_UPLOADS, original_filename="document.txt",
        mime_type="text/plain", size_bytes=len(data), checksum=hashlib.sha256(data).hexdigest(),
        status="uploaded")
    db.add(row)
    await db.commit()
    storage.upload_bytes(row.storage_bucket, key, data, verified_organization_id=event.organization_id)

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(tenant_job_scope, "AsyncSessionLocal", sessions)
    result = await upload_jobs._process(row.id, event.organization_id, "real-scan")
    await db.refresh(row)
    assert result["status"] == ("quarantined" if infected else "ready")
    assert row.status == result["status"]
    if infected:
        assert row.completed_at is None and "Antivirus detected" in row.processing_error
    else:
        assert row.completed_at is not None


@pytest.mark.asyncio
async def test_scanner_outage_does_not_publish_ready_and_same_attempt_recovers(
    db, event, object_storage, monkeypatch, live_scanner,
):
    from app.tasks import upload_jobs, tenant_job_scope
    data = b"Scanner interruption recovery fixture.\n"
    key = f"tenant/{event.organization_id}/event/{event.id}/registration_upload/document/{uuid.uuid4()}.txt"
    row = DurableUpload(organization_id=event.organization_id, event_id=event.id,
        object_key=key, storage_bucket=settings.S3_BUCKET_REGISTRATION_UPLOADS, original_filename="document.txt",
        mime_type="text/plain", size_bytes=len(data), status="uploaded")
    db.add(row)
    await db.commit()
    storage.upload_bytes(row.storage_bucket, key, data, verified_organization_id=event.organization_id)

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(tenant_job_scope, "AsyncSessionLocal", sessions)
    # A disconnected local endpoint exercises the real socket error path.
    monkeypatch.setattr(settings, "ANTIVIRUS_COMMAND", "tcp://127.0.0.1:0")
    with pytest.raises(RuntimeError, match="temporarily unavailable"):
        await upload_jobs._process(row.id, event.organization_id, "recoverable-scan")
    await db.refresh(row)
    assert row.status == "verifying" and row.completed_at is None
    monkeypatch.setattr(settings, "ANTIVIRUS_COMMAND", "tcp://127.0.0.1:3310")
    result = await upload_jobs._process(row.id, event.organization_id, "recoverable-scan")
    assert result["status"] == "ready"
