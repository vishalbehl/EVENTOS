from unittest.mock import AsyncMock, MagicMock

import pytest

from app.routers.command_center import get_command_center_status


def _db_result(rows):
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


@pytest.mark.asyncio
async def test_command_center_does_not_claim_health_without_services():
    db = AsyncMock()
    db.execute.return_value = _db_result([])

    response = await get_command_center_status(db=db, _=None)

    assert response["status"] == "not_configured"
    assert response["services"] == {}


@pytest.mark.asyncio
async def test_command_center_uses_persisted_service_observation():
    service = MagicMock(
        service_type="srr",
        status="degraded",
        last_heartbeat_at=None,
    )
    db = AsyncMock()
    db.execute.return_value = _db_result([service])

    response = await get_command_center_status(db=db, _=None)

    assert response["status"] == "not_configured"
    assert response["services"] == {"srr": "not_configured"}
