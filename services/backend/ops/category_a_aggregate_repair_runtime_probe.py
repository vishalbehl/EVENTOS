"""Committed reviewed-repair proof in the approved isolated local cohort only."""
import asyncio
import argparse
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import secrets
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from app.config import settings
from bootstrap_cloud_database import upsert_login


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--http", action="store_true", help="Use actual login and installed ASGI endpoints")
    parser.add_argument("--browser", action="store_true", help="Use isolated real servers and browser UI")
    args = parser.parse_args()
    target = make_url(settings.DATABASE_URL_SYNC).set(database="category_a_rehearsal_20261015")
    if settings.is_production or target.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the explicit isolated local rehearsal is permitted")
    cohort = json.loads((Path(__file__).parents[3] /
        "docs/category-a/plans-status-evidence/2026-10-15/rehearsal-cohort.json").read_text(encoding="utf-8"))
    owner = uuid.UUID(cohort[0]["organization_id"])
    foreign_owner = uuid.UUID(cohort[1]["organization_id"])
    actor_id = uuid.UUID("cc935543-0b19-4495-a955-8485c6890e13")
    engine = create_engine(target)
    secret = secrets.token_urlsafe(40)
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cursor:
            upsert_login(cursor, "category_a_rehearsal_runtime_20261015", secret, "event_runtime")
        raw.commit()
    finally:
        raw.close()
    with engine.connect() as connection:
        platform = connection.execute(text("""SELECT u.organization_id FROM identity.users u
            JOIN platform.organizations o ON o.id=u.organization_id
            WHERE u.id=:actor AND u.is_active AND u.deleted_at IS NULL
              AND u.platform_role IS NOT NULL AND o.is_platform_org AND o.is_active
              AND o.archived_at IS NULL AND o.suspended_at IS NULL"""), {"actor": actor_id}).scalar_one()
        workspace = connection.execute(text("""SELECT w.id FROM organizer_access.operational_workspaces w
            JOIN platform.organizations o ON o.id=w.organization_id
            WHERE w.organization_id=:owner AND NOT o.is_platform_org AND w.status='ACTIVE'
            ORDER BY w.id LIMIT 1"""), {"owner": owner}).scalar_one()
    settings.DATABASE_URL_ASYNC = target.set(drivername="postgresql+asyncpg",
        username="category_a_rehearsal_runtime_20261015", password=secret).render_as_string(hide_password=False)
    import app.models
    from app.modules.events.models.event import Event
    from app.modules.abstracts.models import AbstractForm
    from app.modules.registration.models.registration_form_config import RegistrationFormConfig
    from app.modules.registration.models.form_category import FormCategory
    from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
    from app.modules.identity.models.user import User
    from app.modules.identity.models.identity_domain_tables import LoginAttempt, MfaDevice
    from app.modules.identity.services.auth_service import hash_password
    from sqlalchemy import delete
    event_id, registration_id, abstract_id, category_id = (uuid.uuid4() for _ in range(4))
    keys = [f"runtime-aggregate-repair-{uuid.uuid4()}" for _ in range(3)]
    credentials = None
    fixture_actor = uuid.uuid4() if args.http or args.browser else None
    source_ids = [uuid.uuid4() for _ in range(3)] if args.browser else []
    page_category_ids = [uuid.uuid4() for _ in range(205)] if args.browser else []
    foreign_category_id = uuid.uuid4() if args.browser else None
    foreign_lineage_id = uuid.uuid4() if args.browser else None
    try:
        with Session(engine) as db:
            if fixture_actor:
                from app.modules.identity.services.mfa_service import generate_totp_secret
                from app.core.encryption import encrypt
                from cryptography.fernet import Fernet
                if not settings.FERNET_KEY:
                    settings.FERNET_KEY = Fernet.generate_key().decode()
                settings.ENFORCE_PRIVILEGED_MFA = True
                credentials = (f"category-a-review-{fixture_actor.hex}@example.com",
                    secrets.token_urlsafe(32), generate_totp_secret())
                db.add(User(id=fixture_actor, organization_id=platform, email=credentials[0],
                    password_hash=hash_password(credentials[1]), first_name="Rehearsal", last_name="Reviewer",
                    role="super_admin", platform_role="SUPER_ADMIN", is_active=True))
                db.flush()
                db.add(MfaDevice(user_id=fixture_actor, encrypted_secret=encrypt(credentials[2]), is_active=True))
                actor_id = fixture_actor
            db.add(Event(id=event_id, organization_id=owner, operational_workspace_id=workspace,
                name="Category A reviewed repair runtime proof", short_code=f"REP{event_id.hex[:10]}",
                start_date=date.today(), end_date=date.today(), status="draft"))
            db.flush()
            db.add_all([RegistrationFormConfig(id=registration_id, event_id=event_id,
                fields=[], settings={"custom_js": "unsupported historical setting"}),
                AbstractForm(id=abstract_id, event_id=event_id, organization_id=owner,
                    title="Historical rubric runtime fixture", schema={"fields": [], "settings": {},
                        "rubric": [{"key": "quality", "label": "Quality", "weight": 99}]}),
                FormCategory(id=category_id, organization_id=owner, name="", slug=f"runtime-review-{category_id.hex}")])
            if args.browser:
                at = datetime.now(timezone.utc)
                db.add_all([FormCategory(id=value, name=f"Category A browser choice {index}",
                    slug=f"choice-{value.hex}", created_at=at + timedelta(microseconds=index))
                    for index, value in enumerate(page_category_ids)])
                db.add(FormCategory(id=foreign_category_id, organization_id=foreign_owner,
                    name="Foreign browser reference fixture", slug=f"foreign-{foreign_category_id.hex}"))
                db.flush()
                db.add(FormTemplate(id=foreign_lineage_id, organization_id=foreign_owner, scope_type="ORGANIZATION",
                    name="Foreign browser lineage fixture", slug=f"foreign-root-{foreign_lineage_id.hex}",
                    category_id=foreign_category_id, category_key=f"foreign-{foreign_category_id.hex}", fields=[], settings={}))
                db.flush()
                registration = db.get(RegistrationFormConfig, registration_id)
                registration.template_id = foreign_lineage_id
                registration.category_id = foreign_category_id
                abstract = db.get(AbstractForm, abstract_id)
                abstract.schema = {**abstract.schema, "template_id": str(foreign_lineage_id)}
            for source_id, scope in zip(source_ids, ("GLOBAL", "ORGANIZATION", "EVENT")):
                stored = {"custom_js": "unsupported historical source setting"}
                if scope == "EVENT":
                    stored["_event_id"] = str(event_id)
                    stored["_source_template_id"] = str(foreign_lineage_id)
                db.add(FormTemplate(id=source_id, organization_id=None if scope == "GLOBAL" else owner,
                    scope_type=scope, name=f"Category A source proof {source_id}", slug=f"proof-{source_id.hex}",
                    category_id=foreign_category_id,
                    category_key="registration" if scope == "GLOBAL" else f"foreign-{foreign_category_id.hex}",
                    fields=[], settings=stored))
                db.flush()
                if scope == "GLOBAL":
                    db.add(FormTemplateReconciliation(template_id=source_id, template_version=1,
                        operation="DOCUMENT_VALIDATION", status="BLOCKED", reason="Isolated historical global fixture"))
            db.commit()
        if args.browser:
            result = asyncio.run(browser_probe(owner, platform, actor_id,
                event_id, registration_id, abstract_id, category_id, credentials, source_ids,
                page_category_ids[-1], foreign_lineage_id))
        else:
            result = asyncio.run(probe(owner, platform, actor_id, registration_id, abstract_id, category_id, keys, credentials))
    finally:
        # Exact generated fixtures only; never default-platform/customer history.
        with engine.begin() as connection:
            if source_ids:
                connection.execute(text("DELETE FROM command_center_audit.logs WHERE resource_id=ANY(:ids)"), {"ids": source_ids})
                connection.execute(text("DELETE FROM design.form_template_reconciliations WHERE template_id=ANY(:ids)"), {"ids": source_ids})
                connection.execute(text("DELETE FROM design.form_templates WHERE id=ANY(:ids)"), {"ids": source_ids})
                connection.execute(text("DELETE FROM design.form_templates WHERE id=:id"), {"id": foreign_lineage_id})
            if page_category_ids:
                connection.execute(text("DELETE FROM design.form_categories WHERE id=ANY(:ids)"),
                    {"ids": [*page_category_ids, foreign_category_id]})
            ids = {"registration": registration_id, "abstract": abstract_id, "category": category_id}
            connection.execute(text("DELETE FROM command_center_audit.logs WHERE resource_id IN (:registration,:abstract,:category)"), ids)
            connection.execute(text("DELETE FROM platform.idempotency_records WHERE idempotency_key=ANY(:keys)"), {"keys": keys})
            connection.execute(text("DELETE FROM design.catalogue_document_reconciliations WHERE resource_id IN (:registration,:abstract,:category)"), ids)
            connection.execute(text("DELETE FROM design.form_categories WHERE id=:category"), ids)
            connection.execute(text("DELETE FROM abstract.abstract_forms WHERE id=:abstract"), ids)
            connection.execute(text("DELETE FROM registration.registration_forms WHERE id=:registration"), ids)
            connection.execute(text("DELETE FROM events.events WHERE id=:id"), {"id": event_id})
            connection.execute(text("DELETE FROM commerce.capability_revisions WHERE scope_type='EVENT' AND scope_id=:id"), {"id": event_id})
            if fixture_actor:
                connection.execute(text("DELETE FROM platform.idempotency_records WHERE actor_id=:actor"), {"actor": fixture_actor})
                connection.execute(text("DELETE FROM command_center_audit.logs WHERE actor_user_id=:actor"), {"actor": fixture_actor})
                if credentials:
                    connection.execute(delete(LoginAttempt).where(LoginAttempt.email == credentials[0]))
                connection.execute(delete(User).where(User.id == fixture_actor))
        engine.dispose()
    result["generated_fixtures_removed"] = True
    if args.browser:
        evidence_path = Path(__file__).parents[1] / "test-results/category-a-browser/verified-reconciliation-result.json"
        evidence_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


async def browser_probe(owner, platform, actor_id, event_id, registration_id, abstract_id, category_id, credentials, source_ids,
                        replacement_category_id, foreign_lineage_id):
    from app.database import AsyncSessionLocal, async_engine
    from app.core.database_security import inspect_database_security
    from app.core.tenant_context import TenantContextGuard
    from app.modules.audit.models.audit_log import AuditLog
    from app.modules.abstracts.models import AbstractForm
    from app.modules.registration.models.registration_form_config import RegistrationFormConfig
    from app.modules.registration.models.form_category import FormCategory
    from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
    from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
    from app.modules.platform.models.idempotency import IdempotencyRecord
    from app.tasks.catalogue_reconciliation import _process_page
    from category_a_browser_harness import run_browser_proof
    resources = [("REGISTRATION_FORM", registration_id, RegistrationFormConfig),
        ("ABSTRACT_FORM", abstract_id, AbstractForm), ("FORM_CATEGORY", category_id, FormCategory)]
    try:
        async with AsyncSessionLocal() as db:
            report = await inspect_database_security(db)
            assert report.runtime_role_is_safe
        for kind, _, _ in resources:
            await _process_page(owner, actor_id, kind, None)
        await _process_page(owner, actor_id, "FORM_TEMPLATE", None)
        result = await asyncio.to_thread(run_browser_proof,
            credentials=credentials, event_id=event_id, owner=owner, template_ids=source_ids,
            replacement_category_id=replacement_category_id, detach_source_template_id=source_ids[2])
        async with AsyncSessionLocal() as db:
            async with TenantContextGuard.scoped(db, owner):
                for kind, resource_id, model in resources:
                    row = await db.get(model, resource_id)
                    assert row is not None and row.version == 2
                    evidence = list((await db.scalars(select(CatalogueDocumentReconciliation).where(
                        CatalogueDocumentReconciliation.resource_type == kind,
                        CatalogueDocumentReconciliation.resource_id == resource_id))).all())
                    expected = {
                        (1, "DOCUMENT_VALIDATION", "BLOCKED"), (1, "EXPLICIT_REPAIR", "COMPLETED"),
                        (2, "DOCUMENT_VALIDATION", "VALID")}
                    if kind == "REGISTRATION_FORM":
                        expected.add((1, "CATALOGUE_REF_DETACHMENT", "COMPLETED"))
                        assert row.template_id is None and row.category_id is None
                        detached = next(item for item in evidence if item.operation == "CATALOGUE_REF_DETACHMENT")
                        assert detached.details["previous_template_id"] == str(foreign_lineage_id)
                    if kind == "ABSTRACT_FORM":
                        assert "template_id" not in row.schema
                    assert {(item.resource_version, item.operation, item.status) for item in evidence} == expected
                    audit = list((await db.scalars(select(AuditLog.id).where(AuditLog.resource_id == resource_id,
                        AuditLog.action_type == "CATALOGUE_AGGREGATE_EXPLICIT_REPAIR"))).all())
                    assert len(audit) == 1
            for source_id, scope in zip(source_ids, ("GLOBAL", "ORGANIZATION", "EVENT")):
                async with TenantContextGuard.scoped(db, platform if scope == "GLOBAL" else owner):
                    source = await db.scalar(select(FormTemplate).where(FormTemplate.id == source_id)
                        .execution_options(shared_form_catalogue=True))
                    assert source is not None and source.version == 2 and "custom_js" not in source.settings
                    assert source.category_id == replacement_category_id
                    assert source.category_key == ("registration" if scope == "GLOBAL"
                        else f"choice-{replacement_category_id.hex}")
                    if scope == "EVENT":
                        assert source.settings["_event_id"] == str(event_id)
                        assert "_source_template_id" not in source.settings
                    evidence = list((await db.scalars(select(FormTemplateReconciliation).where(
                        FormTemplateReconciliation.template_id == source_id))).all())
                    expected = {
                        (1, "DOCUMENT_VALIDATION", "BLOCKED"), (1, "EXPLICIT_REPAIR", "COMPLETED"),
                        (2, "DOCUMENT_VALIDATION", "VALID")}
                    if scope == "EVENT":
                        expected.add((1, "LINEAGE_DETACHMENT", "COMPLETED"))
                        detached = next(item for item in evidence if item.operation == "LINEAGE_DETACHMENT")
                        assert detached.details["previous_source_reference_id"] == str(foreign_lineage_id)
                    assert {(item.template_version, item.operation, item.status) for item in evidence} == expected
                    audits = list((await db.scalars(select(AuditLog).where(AuditLog.resource_id == source_id,
                        AuditLog.action_type == "FORM_TEMPLATE_EXPLICIT_REPAIR"))).all())
                    assert len(audits) == 1 and audits[0].organization_id == (platform if scope == "GLOBAL" else owner)
                    assert audits[0].new_state["category_id"] == str(replacement_category_id)
            async with TenantContextGuard.scoped(db, platform):
                receipts = list((await db.scalars(select(IdempotencyRecord).where(
                    IdempotencyRecord.actor_id == actor_id))).all())
                assert len(receipts) == 3 + len(source_ids) and all(row.status == "COMPLETED" for row in receipts)
        result["persisted_database_and_audits_verified"] = True
        result["stable_operational_purpose_preserved"] = True
        return result
    finally:
        from app.redis import close_redis
        await close_redis()
        await async_engine.dispose()


async def probe(owner, platform, actor_id, registration_id, abstract_id, category_id, keys, credentials=None):
    from app.database import AsyncSessionLocal, async_engine, tenant_org_id
    from app.core.tenant_context import TenantContextGuard
    from app.modules.identity.models.user import User
    from app.modules.audit.models.audit_log import AuditLog
    from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
    from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
    from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest
    from app.modules.registration.application.catalogue_review_queries import list_blocked_aggregates
    from category_a_preflight import BLOCKED_REVIEW_QUERY, blocked_review_is_safe
    from app.tasks.catalogue_reconciliation import _process_page
    results = []
    client = None

    async def http_request(method, path, **kwargs):
        # HTTP must establish context from its own authenticated session, not
        # inherit the observer session's platform selector in this ASGI process.
        previous = tenant_org_id.set(None)
        try:
            return await client.request(method, path, **kwargs)
        finally:
            tenant_org_id.reset(previous)

    try:
        async with AsyncSessionLocal() as db:
            role = (await db.execute(text("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user"))).one()
            assert not role.rolsuper and not role.rolbypassrls
            assert blocked_review_is_safe((await db.execute(BLOCKED_REVIEW_QUERY)).mappings().one())
        if credentials:
            from httpx import ASGITransport, AsyncClient
            from app.main import app
            origin = next(value for value in settings.CORS_ORIGINS if value.startswith("http://localhost:"))
            client = AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False),
                base_url=origin, headers={"Origin": origin})
            from app.modules.identity.services.mfa_service import _totp
            import time
            login = await http_request("POST", "/api/v1/auth/command-center/login",
                json={"email": credentials[0], "password": credentials[1],
                    "totp_code": _totp(credentials[2], int(time.time()) // 30)})
            assert login.status_code == 200, f"Real Command Center login failed: HTTP {login.status_code}"
            client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
        for kind, resource_id, key in zip(("REGISTRATION_FORM", "ABSTRACT_FORM", "FORM_CATEGORY"),
                (registration_id, abstract_id, category_id), keys):
            checked = await _process_page(owner, actor_id, kind, None)
            assert checked["blocked"] >= 1 and checked["checked"] >= checked["blocked"]
            async with AsyncSessionLocal() as db:
                async with TenantContextGuard.scoped(db, platform):
                    actor = await db.get(User, actor_id)
                    listed = await list_blocked_aggregates(db, actor=actor, resource_type=kind)
                    assert resource_id in {issue.resource_id for issue in listed.items}
                    if client:
                        shown = await http_request("GET", "/api/v1/platform/forms/templates/reconciliations/aggregates/blocked",
                            params={"resource_type": kind})
                        assert shown.status_code == 200, f"HTTP review list failed: {shown.status_code}"
                        assert str(resource_id) in {issue["resource_id"] for issue in shown.json()["items"]}
                    document = {"fields": [], "settings": {}}
                    if kind == "ABSTRACT_FORM":
                        document["rubric"] = [{"key": "quality", "label": "Quality", "weight": 100}]
                    elif kind == "FORM_CATEGORY":
                        document = {"name": "Reviewed runtime customer category", "slug": f"reviewed-{category_id.hex}",
                            "description": None, "icon": "ClipboardList", "sort_order": 0}
                    arguments = dict(resource_type=kind, resource_id=resource_id,
                        payload=AggregateRepairRequest(document=document,
                            reason="Approved isolated runtime reviewed document correction"),
                        actor=actor, if_match='"1"', idempotency_key=key)
                    if client:
                        # End the observer transaction before another HTTP
                        # request mutates these rows using its own connection.
                        await db.commit()
                        path = f"/api/v1/platform/forms/templates/reconciliations/aggregates/{kind}/{resource_id}/repair"
                        headers = {"If-Match": '"1"', "Idempotency-Key": key}
                        body = arguments["payload"].model_dump(mode="json")
                        fixed_response = await http_request("POST", path, json=body, headers=headers)
                        assert fixed_response.status_code == 200, f"HTTP reviewed repair failed: {fixed_response.status_code}"
                        fixed = fixed_response.json()
                        repeated = await http_request("POST", path, json=body, headers=headers)
                        assert repeated.status_code == 200 and repeated.json() == fixed
                    else:
                        fixed = await repair_aggregate_document(db, **arguments)
                        assert await repair_aggregate_document(db, **arguments) == fixed
                    assert fixed["version"] == 2
                    assert tenant_org_id.get() == platform
                    remaining = await list_blocked_aggregates(db, actor=actor, resource_type=kind)
                    assert resource_id not in {issue.resource_id for issue in remaining.items}
                    if client:
                        after = await http_request("GET", "/api/v1/platform/forms/templates/reconciliations/aggregates/blocked",
                            params={"resource_type": kind})
                        assert after.status_code == 200
                        assert str(resource_id) not in {issue["resource_id"] for issue in after.json()["items"]}
                async with TenantContextGuard.scoped(db, owner):
                    evidence = list((await db.scalars(select(CatalogueDocumentReconciliation).where(
                        CatalogueDocumentReconciliation.resource_id == resource_id))).all())
                    assert {(row.resource_version, row.operation, row.status) for row in evidence} == {
                        (1, "DOCUMENT_VALIDATION", "BLOCKED"), (1, "EXPLICIT_REPAIR", "COMPLETED"),
                        (2, "DOCUMENT_VALIDATION", "VALID")}
                    audits = list((await db.scalars(select(AuditLog.id).where(AuditLog.resource_id == resource_id,
                        AuditLog.action_type == "CATALOGUE_AGGREGATE_EXPLICIT_REPAIR"))).all())
                    assert len(audits) == 1
            results.append({"resource_type": kind, "committed_repair": True, "replay": True,
                "immutable_history_preserved": True, "mandatory_audit_count": 1,
                "listed_before_repair": True, "removed_after_repair": True})
        assert tenant_org_id.get() is None
        return {"status": "PASSED", "scope": "local_actual_restricted_login", "checks": results,
            "context_restored": True, "review_projection_privileges_safe": True,
            "real_login_and_http": client is not None}
    finally:
        if client:
            await client.aclose()
        from app.redis import close_redis
        await close_redis()
        await async_engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
