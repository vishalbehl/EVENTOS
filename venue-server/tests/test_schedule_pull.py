import pytest
from unittest.mock import MagicMock
from app.sync.schedule_pull import pull_event_queue

@pytest.mark.asyncio
async def test_pull_event_queue_success(mocker):
    mock_get = mocker.patch("httpx.AsyncClient.get")
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {
        "event_id": "EVT123",
        "sessions": [
            {
                "id": "S123",
                "session_code": "C1",
                "name": "Test Session",
                "speakers": []
            }
        ]
    }
    mock_get.return_value = mock_response

    mock_upsert = mocker.patch("app.sync.schedule_pull._upsert_schedule_data")
    mock_broadcast = mocker.patch("app.sync.schedule_pull.broadcast_queue_update")
    # Need to patch AsyncSessionLocal inside schedule_pull
    mock_session_maker = mocker.patch("app.sync.schedule_pull.AsyncSessionLocal")
    
    await pull_event_queue("EVT123")
    
    mock_upsert.assert_called_once()
    mock_broadcast.assert_called_once_with("EVT123")
