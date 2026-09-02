import pytest
from unittest.mock import MagicMock
import uuid
import datetime
from app.config import settings

@pytest.mark.asyncio
async def test_get_session_snapshot_success(async_client, mock_db_session):
    session_id = str(uuid.uuid4())
    speaker_id = str(uuid.uuid4())
    
    # Mock models
    mock_speaker = MagicMock()
    mock_speaker.id = speaker_id
    mock_speaker.first_name = "Jane"
    mock_speaker.last_name = "Doe"

    mock_file = MagicMock()
    mock_file.upload_status = "approved"
    mock_file.storage_path = "path/to/file.pptx"
    mock_file.file_format = "pptx"

    mock_ss = MagicMock()
    mock_ss.speaker = mock_speaker
    # Because current_file is a property, we can just assign it on the mock
    type(mock_ss).current_file = mock_file
    mock_ss.presentation_title = "Future of Tech"
    mock_ss.talk_order = 1
    mock_ss.duration_minutes = 20

    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.session_code = "KEYNOTE"
    mock_session.name = "Morning Keynote"
    mock_session.room_id = None
    mock_session.start_time = datetime.datetime.now(datetime.timezone.utc)
    mock_session.end_time = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
    mock_session.session_speakers = [mock_ss]

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_session
    mock_db_session.execute.return_value = mock_result

    response = await async_client.get(
        f"/api/v1/sessions/{session_id}/snapshot", 
        headers={"X-Venue-Key": settings.VENUE_AUTH_KEY}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == session_id
    assert data["session_code"] == "KEYNOTE"
    assert len(data["speakers"]) == 1
    
    sp = data["speakers"][0]
    assert sp["speaker_id"] == speaker_id
    assert sp["name"] == "Jane Doe"
    assert sp["file_path"] == "path/to/file.pptx"

@pytest.mark.asyncio
async def test_get_session_snapshot_not_found(async_client, mock_db_session):
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db_session.execute.return_value = mock_result

    response = await async_client.get(
        f"/api/v1/sessions/{str(uuid.uuid4())}/snapshot", 
        headers={"X-Venue-Key": settings.VENUE_AUTH_KEY}
    )
    
    assert response.status_code == 404

@pytest.mark.asyncio
async def test_lock_session_success(async_client, mock_db_session):
    session_id = str(uuid.uuid4())
    mock_session = MagicMock()
    mock_session.status = "draft"
    
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_session
    mock_db_session.execute.return_value = mock_result

    response = await async_client.post(
        f"/api/v1/sessions/{session_id}/lock", 
        headers={"X-Venue-Key": settings.VENUE_AUTH_KEY}
    )
    
    assert response.status_code == 200
    assert mock_session.status == "active"
    mock_db_session.commit.assert_called_once()
