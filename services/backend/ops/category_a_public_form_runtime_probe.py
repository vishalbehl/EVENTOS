"""Local approved-cohort public-event lookup under actual restricted credentials.

Temporarily activates one synthetic event, then restores its previous state.
Does not grant membership, change a commercial contract, or use the platform org.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
import secrets
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from app.config import settings
from bootstrap_cloud_database import upsert_login


def main():
    if settings.is_production:
        raise RuntimeError("This probe is forbidden in production")
    target = make_url(settings.DATABASE_URL_SYNC).set(database="category_a_rehearsal_20261015")
    if target.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the isolated local rehearsal is permitted")
    cohort_file = Path(__file__).parents[3] / "docs/category-a/plans-status-evidence/2026-10-15/rehearsal-cohort.json"
    document = json.loads(cohort_file.read_text(encoding="utf-8"))
    rows = document if isinstance(document, list) else document["organizations"]
    owner = uuid.UUID(rows[0]["organization_id"])
    engine = create_engine(target)
    secret = secrets.token_urlsafe(40)
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cursor:
            upsert_login(cursor, "category_a_rehearsal_runtime_20261015", secret, "event_runtime")
        raw.commit()
    finally:
        raw.close()
    template_id, binding_id = uuid.uuid4(), uuid.uuid4()
    with engine.begin() as connection:
        event = connection.execute(text("""SELECT e.id, e.status FROM events.events e
            JOIN platform.organizations o ON o.id=e.organization_id
            WHERE e.organization_id=:owner AND o.is_platform_org IS FALSE
            ORDER BY e.id LIMIT 1"""), {"owner": owner}).one()
        connection.execute(text("UPDATE events.events SET status='active' WHERE id=:id"), {"id": event.id})
        # Dedicated persisted read fixture, not a mocked endpoint response.
        connection.execute(text("""INSERT INTO design.form_templates
            (id,organization_id,name,slug,category_key,scope_type,fields,settings,
             is_active,version,created_at,updated_at)
            VALUES (:id,:owner,'Public runtime survey probe',:slug,'survey','EVENT',
                    '[]'::jsonb,CAST(:settings AS jsonb),true,1,now(),now())"""),
            {"id": template_id, "owner": owner, "slug": f"public-runtime-probe-{template_id.hex}",
             "settings": json.dumps({"_event_id": str(event.id)})})
        connection.execute(text("""INSERT INTO design.event_form_template_bindings
            (id,organization_id,event_id,purpose,template_id,version,created_at,updated_at)
            VALUES (:id,:owner,:event,'SURVEY',:template,1,now(),now())"""),
            {"id": binding_id, "owner": owner, "event": event.id, "template": template_id})
    settings.DATABASE_URL_ASYNC = target.set(drivername="postgresql+asyncpg",
        username="category_a_rehearsal_runtime_20261015", password=secret).render_as_string(hide_password=False)
    try:
        result = asyncio.run(probe(event.id, owner))
    finally:
        with engine.begin() as connection:
            connection.execute(text("DELETE FROM design.event_form_template_bindings WHERE id=:id"), {"id": binding_id})
            connection.execute(text("DELETE FROM design.form_templates WHERE id=:id"), {"id": template_id})
            connection.execute(text("UPDATE events.events SET status=:state WHERE id=:id"),
                {"id": event.id, "state": event.status})
        engine.dispose()
    result["synthetic_event_state_restored"] = True
    passed = (result["raw_missing_context_lookup"] == 404
        and result["scoped_public_lookup"] == 200 and result["owner_context_lookup"] == 200
        and result["context_restored"] and result["public_scope_survives_rollback"]
        and result["public_discovery_privileges_safe"]
        and result["http_public_projection"] == 200 and result["http_customer_denied"] in {401,403})
    result["status"] = "PASSED" if passed else "FAILED_PUBLIC_EVENT_DISCOVERY"
    print(json.dumps(result, indent=2))
    return 0 if passed else 2


async def probe(event_id, owner):
    from fastapi import HTTPException
    from app.database import AsyncSessionLocal, async_engine, tenant_org_id
    from app.core.tenant_context import TenantContextGuard
    from app.modules.registration.routers.registration_portal import _public_form_event
    from app.modules.registration.services.public_form_context import public_form_scope
    from category_a_preflight import PUBLIC_DISCOVERY_QUERY, public_discovery_is_safe
    from httpx import ASGITransport, AsyncClient
    result = {}
    token = tenant_org_id.set(None)
    try:
        async with AsyncSessionLocal() as db:
            role = (await db.execute(text("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user"))).one()
            assert not role.rolsuper and not role.rolbypassrls
            metadata = (await db.execute(PUBLIC_DISCOVERY_QUERY)).mappings().one()
            result["public_discovery_privileges_safe"] = public_discovery_is_safe(metadata)
            try:
                found = await _public_form_event(db, event_id)
                result["raw_missing_context_lookup"] = 200 if found.id == event_id else 500
            except HTTPException as exc:
                result["raw_missing_context_lookup"] = exc.status_code
            async with public_form_scope(db, event_id):
                found = await _public_form_event(db, event_id)
                await db.commit()
                found_after_commit = await _public_form_event(db, event_id)
                result["scoped_public_lookup"] = 200 if found.id == found_after_commit.id == event_id else 500
                await db.rollback()
                found_after_rollback = await _public_form_event(db, event_id)
                result["public_scope_survives_rollback"] = found_after_rollback.id == event_id
            result["context_restored"] = tenant_org_id.get() is None
            async with TenantContextGuard.scoped(db, owner):
                found = await _public_form_event(db, event_id)
                result["owner_context_lookup"] = 200 if found.id == event_id else 500
        from app.main import app
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False),
                               base_url="http://localhost") as client:
            public = await client.get(f"/api/v1/public/events/{event_id}/operational-forms/SURVEY")
            result["http_public_projection"] = public.status_code
            if public.status_code == 200:
                projection = public.json()
                assert set(projection) == {"purpose","title","fields","settings","binding_version","template_version"}
                assert projection["title"] == "Public runtime survey probe"
            private = await client.get(f"/api/v1/organizations/{owner}/workspaces")
            result["http_customer_denied"] = private.status_code
            assert tenant_org_id.get() is None
        return result
    finally:
        tenant_org_id.reset(token)
        from app.redis import close_redis
        await close_redis()
        await async_engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
