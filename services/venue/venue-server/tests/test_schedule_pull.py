import pytest
from unittest.mock import MagicMock
from app.sync.schedule_pull import _source_root_url, pull_event_queue


def test_cloud_source_root_uses_venue_sync_api():
    assert _source_root_url("https://command.example.com", "cloud") == "https://command.example.com/api/v1/sync"
    assert _source_root_url("https://command.example.com/api/v1/sync", "cloud") == "https://command.example.com/api/v1/sync"
    assert _source_root_url("https://command.example.com/api/v1/registration-source", "cloud") == "https://command.example.com/api/v1/sync"
    assert _source_root_url("https://command.example.com", "registration_server") == "https://command.example.com/api/v1/registration-source"

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


@pytest.mark.asyncio
async def test_pull_event_queue_with_api_key_uses_venue_sync_endpoint(mocker):
    mock_get = mocker.patch("httpx.AsyncClient.get")
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {"event_id": "EVT123", "sessions": []}
    mock_get.return_value = mock_response

    mocker.patch("app.sync.schedule_pull._upsert_schedule_data")
    mocker.patch("app.sync.schedule_pull.broadcast_queue_update")
    mocker.patch("app.sync.schedule_pull.AsyncSessionLocal")

    await pull_event_queue("EVT123", source_url="https://command.example.com", api_key="venue_key", source_type="cloud")

    called_url = mock_get.call_args.args[0]
    called_headers = mock_get.call_args.kwargs["headers"]
    assert called_url == "https://command.example.com/api/v1/sync/events/EVT123/queue"
    assert called_headers["X-Device-Key"] == "venue_key"
