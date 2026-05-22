import pytest
from app.config import settings

@pytest.mark.asyncio
async def test_receive_file_success(async_client, mock_minio, mock_db_session):
    # Missing files should raise 422, but we need to mock UploadFile correctly in httpx
    # We will pass a simple file
    headers = {
        "X-Cloud-Key": settings.CLOUD_API_KEY,
        "file-id": "123e4567-e89b-12d3-a456-426614174000",
        "storage-path": "S101/presentation.pptx",
        "file-format": "pptx",
        "file-size-bytes": "1024"
    }
    files = {'file': ('presentation.pptx', b'dummy content', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')}
    
    response = await async_client.post("/internal/sync/receive-file", headers=headers, files=files)
    
    assert response.status_code == 200
    mock_minio.put_object.assert_called_once()
    mock_db_session.commit.assert_called_once()

@pytest.mark.asyncio
async def test_receive_file_unauthorized(async_client):
    response = await async_client.post("/internal/sync/receive-file", headers={"X-Cloud-Key": "invalid"})
    assert response.status_code == 403

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
