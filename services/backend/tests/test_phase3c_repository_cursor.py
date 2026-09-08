"""Phase 3C repository-contract and stable-cursor evidence."""

from datetime import datetime, timezone
from pathlib import Path
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.rbac.models.organization_member import OrganizationMember
from app.schemas.cursor_pagination import encode_cursor
from tests.conftest import auth_headers


ROOT = Path(__file__).resolve().parents[1]


def test_custom_organization_repositories_reject_oversized_cursor_pages_and_do_not_commit():
    for relative_path in (
        "app/modules/platform/teams/repository.py",
        "app/modules/platform/departments/repository.py",
        "app/modules/platform/roles/repository.py",
    ):
        source = (ROOT / relative_path).read_text(encoding="utf-8")
        cursor_method = source.split("async def cursor_page", 1)[1].split("async def ", 1)[0]
        assert "bounded_page_size(limit" in cursor_method
        assert "bounded_limit + 1" in cursor_method
        assert ".order_by(" in cursor_method
        assert "await self.db.commit()" not in source
        assert "Unsupported repository update field" in source


def test_member_cursor_route_is_tenant_scoped_and_uses_seek_pagination():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/organiser/application/queries.py").read_text(encoding="utf-8")
    route = router.split("async def organiser_members_cursor", 1)[1].split("@router.", 1)[0]
    service = queries.split("class OrganiserMemberQueryService", 1)[1].split("class OrganiserEntitlementQueryService", 1)[0]

    assert "/members/cursor" in router
    assert "list_members_cursor" in route
    assert "OrganizationMember.organization_id == organization_id" in service
    assert "OrganizationMember.invited_at < position.occurred_at" in service
    assert "OrganizationMember.id < position.record_id" in service
    assert "OrganizationMember.invited_at.desc(), OrganizationMember.id.desc()" in service
    assert "bounded_limit + 1" in service


@pytest.mark.asyncio
async def test_member_cursor_traversal_handles_equal_timestamps_and_intervening_inserts(
    client: AsyncClient,
    organizer,
    organization,
    db: AsyncSession,
):
    same_time = datetime(2026, 9, 7, 12, 0, tzinfo=timezone.utc)
    search = "phase3c-cursor"
    for number in (1, 2, 3):
        db.add(
            OrganizationMember(
                id=uuid.UUID(int=number),
                organization_id=organization.id,
                org_role="member",
                invite_email=f"{search}-{number}@test.com",
                invited_at=same_time,
                is_active=True,
                version=1,
            )
        )
    await db.flush()

    url = f"/api/v1/organiser/members/cursor?limit=2&search={search}"
    first = await client.get(url, headers=auth_headers(organizer))
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert [item["id"] for item in first_body["items"]] == [str(uuid.UUID(int=3)), str(uuid.UUID(int=2))]
    assert first_body["next_cursor"]

    # A new row that sorts ahead of the first page must not be replayed on page two.
    db.add(
        OrganizationMember(
            id=uuid.UUID(int=4),
            organization_id=organization.id,
            org_role="member",
            invite_email=f"{search}-4@test.com",
            invited_at=same_time,
            is_active=True,
            version=1,
        )
    )
    await db.flush()

    second = await client.get(
        f"{url}&cursor={first_body['next_cursor']}",
        headers=auth_headers(organizer),
    )
    assert second.status_code == 200, second.text
    second_ids = [item["id"] for item in second.json()["items"]]
    assert second_ids == [str(uuid.UUID(int=1))]
    first_ids = {item["id"] for item in first_body["items"]}
    assert not first_ids.intersection(second_ids)

    invalid = await client.get(
        f"{url}&cursor=not-a-valid-cursor", headers=auth_headers(organizer)
    )
    assert invalid.status_code == 400
    assert invalid.json()["detail"]["code"] == "INVALID_CURSOR"

    oversized = await client.get(
        f"/api/v1/organiser/members/cursor?limit=101&search={search}",
        headers=auth_headers(organizer),
    )
    assert oversized.status_code == 422


def test_cursor_contract_rejects_malformed_tokens_at_the_shared_boundary():
    token = encode_cursor(datetime(2026, 9, 7, tzinfo=timezone.utc), uuid.uuid4())
    assert token
    cursor_schema = (ROOT / "app/schemas/cursor_pagination.py").read_text(encoding="utf-8")
    assert "MAX_CURSOR_LENGTH = 512" in cursor_schema
    assert '"INVALID_CURSOR"' in cursor_schema
    assert "len(value) > MAX_CURSOR_LENGTH" in cursor_schema
