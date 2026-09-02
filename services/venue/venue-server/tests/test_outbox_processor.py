import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone
from app.sync.outbox_processor import _get_candidate_push_urls, process_outbox
from app.models.sync_outbox import SyncOutbox


def test_outbox_prefers_venue_sync_push_before_registration_alias():
    urls = _get_candidate_push_urls("https://command.example.com", "EVT123")

    assert urls[0] == "https://command.example.com/api/v1/sync/events/EVT123/push"
    assert urls[1] == "https://command.example.com/api/v1/events/EVT123/venue-sync/push"
    assert urls[2] == "https://command.example.com/api/v1/registration-source/events/EVT123/push"

@pytest.mark.asyncio
async def test_process_outbox_success(mocker):
    # Mock database query
    mock_db = AsyncMock()
    mock_session_maker = mocker.patch("app.sync.outbox_processor.AsyncSessionLocal")
    mock_session_maker.return_value.__aenter__.return_value = mock_db

    # Create dummy records
    record1 = SyncOutbox(
        id=uuid.uuid4(),
        entity_type="attendance_log",
        entity_id=uuid.uuid4(),
        action="create",
        payload={"participant_id": str(uuid.uuid4()), "session_id": str(uuid.uuid4()), "checkin_time": "2026-05-22T10:00:00Z"},
        status="pending",
        attempts=0,
        created_at=datetime.now(timezone.utc)
    )
    
    # Mock db.execute to return our record
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [record1]
    mock_db.execute.return_value = mock_result

    # Mock HTTP push to Cloud
    mock_post = mocker.patch("httpx.AsyncClient.post")
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {
        "processed_ids": [str(record1.id)],
        "errors": []
    }
    mock_post.return_value = mock_response

    # Run the processor
    await process_outbox("EVT123")

    # Verify requests were made
    mock_post.assert_called_once()
    assert record1.status == "completed"
    assert record1.attempts == 1
    assert record1.synced_at is not None
    mock_db.commit.assert_called()
