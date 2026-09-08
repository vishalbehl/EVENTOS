from pathlib import Path

import pytest
from httpx import AsyncClient

from app.modules.identity.models.user import User
from tests.conftest import auth_headers


ROOT = Path(__file__).resolve().parents[1]


def test_platform_user_cursor_route_uses_bounded_query_service():
    router = (ROOT / "app/modules/platform/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def get_platform_users_cursor", 1)[1].split("# C2:", 1)[0]
    assert "PlatformUserQueryService(db).cursor_page" in region
    assert "limit: int = Query(20, ge=1, le=100)" in region
    assert "select(\n                User.id" in queries
    assert "User.created_at.desc(), User.id.desc()" in queries
    assert "User.deleted_at.is_(None)" in queries
    assert "decode_cursor(cursor)" in queries
    assert "encode_cursor(page_rows[-1][\"created_at\"], page_rows[-1][\"id\"])" in queries
    assert "await self.db.commit()" not in queries


def test_platform_user_compatibility_route_uses_explicit_offset_projection():
    router = (ROOT / "app/modules/platform/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def get_platform_users(", 1)[1].split("@router.get(\"/global-users/cursor\")", 1)[0]
    assert "PlatformUserQueryService(db).offset_page" in region
    assert "q = select(User)" not in region
    method = queries.split("    async def offset_page", 1)[1].split("\n\n\n@dataclass", 1)[0]
    assert "select(User.id" in method
    assert ".offset(bounded_skip)" in method
    assert ".limit(bounded_limit)" in method
    assert "User.created_at.desc(), User.id.desc()" in method
    assert "User.deleted_at.is_(None)" in method


@pytest.mark.asyncio
async def test_platform_user_compatibility_route_preserves_legacy_response_shape(
    client: AsyncClient,
    super_admin: User,
):
    response = await client.get(
        "/api/v1/platform/users?skip=0&limit=5",
        headers=auth_headers(super_admin),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"items", "total", "summary"}
    assert isinstance(body["items"], list)
    assert set(body["summary"]) == {
        "total_users",
        "active_users",
        "two_fa_enabled",
        "total_admins",
        "active_impersonations",
    }
