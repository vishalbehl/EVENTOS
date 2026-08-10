import pytest
from app.websocket.connection import ConnectionManager
from unittest.mock import AsyncMock

@pytest.mark.asyncio
async def test_connection_manager_connect(mocker):
    # Mock redis during init
    mocker.patch("redis.asyncio.from_url", return_value=AsyncMock())
    manager = ConnectionManager()
    
    mock_ws = AsyncMock()
    await manager.connect(mock_ws, "global")
    
    mock_ws.accept.assert_called_once()
    assert mock_ws in manager.active_connections["global"]

@pytest.mark.asyncio
async def test_connection_manager_disconnect(mocker):
    mocker.patch("redis.asyncio.from_url", return_value=AsyncMock())
    manager = ConnectionManager()
    
    mock_ws = AsyncMock()
    manager.active_connections["global"] = [mock_ws]
    
    manager.disconnect(mock_ws, "global")
    assert mock_ws not in manager.active_connections["global"]

@pytest.mark.asyncio
async def test_connection_manager_broadcast(mocker):
    mocker.patch("redis.asyncio.from_url", return_value=AsyncMock())
    manager = ConnectionManager()
    
    mock_ws1 = AsyncMock()
    mock_ws2 = AsyncMock()
    manager.active_connections["global"] = [mock_ws1, mock_ws2]
    
    await manager.broadcast_local({"event": "test"}, "global")
    
    mock_ws1.send_json.assert_called_once_with({"event": "test"})
    mock_ws2.send_json.assert_called_once_with({"event": "test"})
