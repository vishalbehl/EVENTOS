import uuid

import pytest

from app.modules.agenda.models.room_type import RoomType
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_room_type_catalog_includes_global_types_once_for_tenant(
    client,
    db,
    organizer,
):
    code = f"ROOM_{uuid.uuid4().hex[:8].upper()}"
    for name in ("Global room type", "Duplicate global room type"):
        db.add(RoomType(
            organization_id=None,
            name=name,
            code=code,
            description="Available to every organiser tenant",
            is_system=True,
            is_active=True,
        ))
    await db.flush()

    response = await client.get(
        "/api/v1/agenda-catalogs/room-types",
        headers=auth_headers(organizer),
    )

    assert response.status_code == 200, response.text
    matching_types = [item for item in response.json() if item["code"] == code]
    assert len(matching_types) == 1
    assert matching_types[0]["organization_id"] is None
