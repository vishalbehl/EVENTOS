"""Real login/API persistence check, exclusively on category-a-test (not platform)."""
import asyncio
import json
import os
from pathlib import Path
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from httpx import ASGITransport, AsyncClient
from app.config import settings
from app.database import async_engine
from app.redis import close_redis


async def run():
    if settings.is_production:
        raise RuntimeError("Local disposable-cohort probe is forbidden in production")
    password = os.environ["CATEGORY_A_TEST_PASSWORD"]
    from app.main import app
    results = []
    try:
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://localhost") as client:
            for role in ("owner", "admin", "member", "billing-only"):
                login = await client.post("/api/v1/auth/login", json={"email": f"category-a-{role}@example.com", "password": password})
                results.append({"role": role, "operation": "login", "status": login.status_code})
                if login.status_code != 200:
                    continue
                token = login.json()["access_token"]
                headers = {"Authorization": "Bearer " + token}
                bootstrap = await client.get("/api/v1/access/bootstrap", headers=headers)
                results.append({"role": role, "operation": "bootstrap", "status": bootstrap.status_code})
                if bootstrap.status_code != 200:
                    continue
                org = bootstrap.json()["organization_id"]
                route = f"/api/v1/organizations/{org}/workspaces"
                listed = await client.get(route, headers=headers)
                results.append({"role": role, "operation": "list", "status": listed.status_code,
                    "rows": len(listed.json().get("items", [])) if listed.status_code == 200 else None})
                created = await client.post(route, headers={**headers, "Idempotency-Key": uuid.uuid4().hex},
                    json={"name": "Disposable API probe " + uuid.uuid4().hex[:8], "reason": "Authorised isolated cohort verification"})
                expected = 200 if role in {"owner", "admin"} else 403
                results.append({"role": role, "operation": "create", "status": created.status_code, "expected": expected})
                if created.status_code == 200:
                    row = created.json()
                    archived = await client.patch(route + "/" + row["id"],
                        headers={**headers, "Idempotency-Key": uuid.uuid4().hex, "If-Match": str(row["version"])},
                        json={"status": "ARCHIVED", "reason": "Complete disposable cohort verification"})
                    results.append({"role": role, "operation": "archive", "status": archived.status_code, "expected": 200})
    finally:
        await close_redis()
        await async_engine.dispose()
    return results


if __name__ == "__main__":
    results = asyncio.run(run())
    print(json.dumps({"environment": settings.environment, "default_organization_tested": False, "checks": results}, indent=2))
    raise SystemExit(0 if len(results) >= 16 and all(row["status"] == row.get("expected", 200) for row in results) else 1)
