import pytest
import hashlib
from types import SimpleNamespace
from unittest.mock import AsyncMock
from app.config import settings

@pytest.mark.asyncio
async def test_receive_file_success(async_client, mock_minio, mock_db_session, mocker):
    # Missing files should raise 422, but we need to mock UploadFile correctly in httpx
    # We will pass a simple file
    payload = b'dummy content'
    headers = {
        "X-Cloud-Key": settings.CLOUD_API_KEY,
        "file-id": "123e4567-e89b-12d3-a456-426614174000",
        "storage-path": "S101/presentation.pptx",
        "file-format": "pptx",
        "file-size-bytes": str(len(payload)),
        "content-sha256": hashlib.sha256(payload).hexdigest(),
    }
    mock_db_session.get.return_value = SimpleNamespace(
        id="123e4567-e89b-12d3-a456-426614174000",
        event_id="123e4567-e89b-12d3-a456-426614174001",
        session_id="123e4567-e89b-12d3-a456-426614174002",
        storage_path="S101/presentation.pptx",
        file_format="pptx",
        file_size_bytes=len(payload),
        content_sha256=headers["content-sha256"],
    )
    files = {'file': ('presentation.pptx', payload, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')}
    
    mock_intents = mocker.patch("app.routers.srr.create_asset_transfer_intents", new_callable=AsyncMock)
    response = await async_client.post("/internal/sync/receive-file", headers=headers, files=files)
    
    assert response.status_code == 200
    mock_minio.put_object.assert_called_once()
    mock_intents.assert_awaited_once()
    mock_db_session.commit.assert_called_once()

@pytest.mark.asyncio
async def test_receive_file_unauthorized(async_client):
    response = await async_client.post("/internal/sync/receive-file", headers={"X-Cloud-Key": "invalid"})
    assert response.status_code == 403

@pytest.mark.asyncio
async def test_receive_file_rejects_missing_authoritative_metadata(async_client, mock_db_session):
    headers = {
        "X-Cloud-Key": settings.CLOUD_API_KEY,
        "file-id": "123e4567-e89b-12d3-a456-426614174000",
        "storage-path": "S101/presentation.pptx",
        "file-format": "pptx",
        "file-size-bytes": "12",
    }
    response = await async_client.post(
        "/internal/sync/receive-file",
        headers=headers,
        files={"file": ("presentation.pptx", b"dummy content", "application/octet-stream")},
    )
    assert response.status_code == 409
    assert "metadata" in response.json()["detail"]

@pytest.mark.asyncio
async def test_receive_file_rejects_checksum_mismatch(async_client, mock_db_session):
    mock_db_session.get.return_value = SimpleNamespace(
        storage_path="S101/presentation.pptx",
        file_format="pptx",
        file_size_bytes=13,
        content_sha256="0" * 64,
    )
    headers = {
        "X-Cloud-Key": settings.CLOUD_API_KEY,
        "file-id": "123e4567-e89b-12d3-a456-426614174000",
        "storage-path": "S101/presentation.pptx",
        "file-format": "pptx",
        "file-size-bytes": "13",
    }
    response = await async_client.post(
        "/internal/sync/receive-file",
        headers=headers,
        files={"file": ("presentation.pptx", b"dummy content", "application/octet-stream")},
    )
    assert response.status_code == 400
    assert "checksum" in response.json()["detail"]
    mock_db_session.commit.assert_not_called()

@pytest.mark.asyncio
async def test_queue_updated_webhook(async_client, mocker):
    mock_pull = mocker.patch("app.sync.schedule_pull.pull_event_queue")
    headers = {
        "X-Cloud-Key": settings.CLOUD_API_KEY,
        "event-id": "EVT123"
    }
    
    response = await async_client.post("/internal/sync/queue-updated", headers=headers)
    assert response.status_code == 200
    # Background tasks run inline with httpx.ASGITransport, so it will be called.
    mock_pull.assert_called_once_with("EVT123")
