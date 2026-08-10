from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.routers.admin_dashboard import _as_utc, get_dashboard_metrics


@pytest.mark.asyncio
async def test_dashboard_returns_explicit_empty_state_when_no_event_exists():
    db = AsyncMock()
    query_result = MagicMock()
    query_result.scalar_one_or_none.return_value = None
    db.execute.return_value = query_result

    response = await get_dashboard_metrics(event_id=None, db=db, _=MagicMock())

    assert response["state"] == "no_event"
    assert response["event"] is None
    assert "No event" in response["message"]


def test_dashboard_normalizes_naive_database_timestamps_to_utc():
    value = _as_utc(datetime(2026, 8, 8, 9, 30))

    assert value.isoformat() == "2026-08-08T09:30:00+00:00"
