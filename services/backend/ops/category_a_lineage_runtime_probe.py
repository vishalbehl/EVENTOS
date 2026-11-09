"""Approved isolated restricted-role provenance ownership and history proof."""
import asyncio
from datetime import date
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
    target = make_url(settings.DATABASE_URL_SYNC).set(database="category_a_rehearsal_20261015")
    if settings.is_production or target.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the explicit isolated local rehearsal is permitted")
    cohort = json.loads((Path(__file__).parents[3] /
        "docs/category-a/plans-status-evidence/2026-10-15/rehearsal-cohort.json").read_text(encoding="utf-8"))
    owner, foreign = [uuid.UUID(row["organization_id"]) for row in cohort[:2]]
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
            JOIN platform.organizations o ON o.id=u.organization_id WHERE u.id=:actor
            AND u.platform_role='SUPER_ADMIN' AND u.is_active AND u.deleted_at IS NULL
            AND o.is_platform_org AND o.is_active AND o.archived_at IS NULL AND o.suspended_at IS NULL"""),
            {"actor": actor_id}).scalar_one()
        assert connection.execute(text("SELECT count(*) FROM platform.organizations WHERE id=ANY(:ids) AND NOT is_platform_org"),
            {"ids": [owner, foreign]}).scalar_one() == 2
        workspace = connection.execute(text("SELECT id FROM organizer_access.operational_workspaces WHERE organization_id=:owner AND status='ACTIVE' ORDER BY id LIMIT 1"),
            {"owner": owner}).scalar_one()
    settings.DATABASE_URL_ASYNC = target.set(drivername="postgresql+asyncpg",
        username="category_a_rehearsal_runtime_20261015", password=secret).render_as_string(hide_password=False)
    import app.models
    from app.modules.events.models.event import Event
    from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
    event_id, roots, copies = uuid.uuid4(), [uuid.uuid4() for _ in range(3)], [uuid.uuid4() for _ in range(4)]
    ids = roots + copies
    key = f"lineage-runtime-{uuid.uuid4()}"
    try:
        with Session(engine) as db:
            db.add(Event(id=event_id, organization_id=owner, operational_workspace_id=workspace,
                name="Category A isolated lineage proof", short_code=f"LIN{event_id.hex[:10]}",
                start_date=date.today(), end_date=date.today(), status="draft"))
            db.flush()
            for index, root_id in enumerate(roots):
                db.add(FormTemplate(id=root_id, name="Historical lineage root", slug=f"lineage-root-{root_id.hex}",
                    organization_id=foreign if index == 2 else None,
                    scope_type="ORGANIZATION" if index == 2 else "GLOBAL", is_active=index != 1,
                    fields=[], settings={}))
            db.flush()
            for copy_id, root_id in zip(copies, [*roots, roots[1]]):
                db.add(FormTemplate(id=copy_id, name="Historical lineage copy", slug=f"lineage-copy-{copy_id.hex}",
                    organization_id=owner, scope_type="EVENT", fields=[],
                    settings={"_event_id": str(event_id), "_source_template_id": str(root_id)}))
            db.flush()
            db.add_all([FormTemplateReconciliation(template_id=value, template_version=1,
                operation="DOCUMENT_VALIDATION", status="BLOCKED" if value == copies[-1] else "VALID") for value in copies])
            db.commit()
        result = asyncio.run(probe(owner, platform, actor_id, roots, copies, key))
    finally:
        with engine.begin() as connection:
            connection.execute(text("DELETE FROM platform.idempotency_records WHERE idempotency_key=ANY(:keys)"), {"keys": [key, key + "-denied", key + "-detached"]})
            connection.execute(text("DELETE FROM command_center_audit.logs WHERE resource_id=ANY(:ids)"), {"ids": ids})
            connection.execute(text("DELETE FROM design.form_template_reconciliations WHERE template_id=ANY(:ids)"), {"ids": ids})
            connection.execute(text("DELETE FROM design.form_templates WHERE id=ANY(:ids)"), {"ids": ids})
            connection.execute(text("DELETE FROM events.events WHERE id=:id"), {"id": event_id})
        engine.dispose()
    print(json.dumps({**result, "generated_fixtures_removed": True}, indent=2))


async def probe(owner, platform, actor_id, roots, copies, key):
    from fastapi import HTTPException
    from app.database import AsyncSessionLocal, async_engine, tenant_org_id
    from app.core.tenant_context import TenantContextGuard
    from app.core.database_security import inspect_database_security
    from app.modules.identity.models.user import User
    from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
    from app.modules.registration.application.template_lineage import require_historical_lineage
    from app.modules.registration.application.template_commands import repair_catalogue_document
    from app.modules.registration.schemas.catalogue_contracts import CatalogueRepairRequest
    from app.tasks.catalogue_reconciliation import _process_page
    try:
        async with AsyncSessionLocal() as db:
            assert (await inspect_database_security(db)).runtime_role_is_safe
            async with TenantContextGuard.scoped(db, owner):
                for copy_id, expected in zip(copies[:3], roots):
                    copy = await db.get(FormTemplate, copy_id)
                    if expected == roots[2]:
                        try:
                            await require_historical_lineage(db, copy)
                        except HTTPException as exc:
                            assert exc.status_code == 409
                        else:
                            raise AssertionError("Foreign provenance was accepted")
                    else:
                        assert await require_historical_lineage(db, copy) == expected
        await _process_page(owner, actor_id, "FORM_TEMPLATE", None)
        await _process_page(owner, actor_id, "FORM_TEMPLATE", None)
        async with AsyncSessionLocal() as db:
            async with TenantContextGuard.scoped(db, owner):
                for index, copy_id in enumerate(copies[:3]):
                    copy = await db.get(FormTemplate, copy_id)
                    assert copy.version == (2 if index == 2 else 1)
                blocked = await db.scalar(select(FormTemplateReconciliation).where(
                    FormTemplateReconciliation.template_id == copies[2],
                    FormTemplateReconciliation.template_version == 2))
                assert blocked.details["issues"] == ["LINEAGE_REFERENCE_UNAVAILABLE"]
            async with TenantContextGuard.scoped(db, platform):
                actor = await db.get(User, actor_id)
            args = dict(template_id=copies[3], actor=actor, if_match='"1"', idempotency_key=key,
                payload=CatalogueRepairRequest(document={"fields": [], "settings": {}},
                    reason="Approved isolated historical lineage preservation"))
            result = await repair_catalogue_document(db, **args)
            assert result["version"] == 2 and await repair_catalogue_document(db, **args) == result
            async with TenantContextGuard.scoped(db, owner):
                copy = await db.get(FormTemplate, copies[3], populate_existing=True)
                assert copy.settings["_source_template_id"] == str(roots[1])
            try:
                await repair_catalogue_document(db, **{**args, "template_id": copies[2],
                    "if_match": '"2"', "idempotency_key": key + "-denied"})
            except HTTPException as exc:
                assert exc.detail == {"code": "EVENT_TEMPLATE_LINEAGE_REPAIR_REQUIRED"}
            else:
                raise AssertionError("Reviewed repair carried foreign provenance")
            assert tenant_org_id.get() is None
            async with TenantContextGuard.scoped(db, platform):
                actor = await db.get(User, actor_id, populate_existing=True)
            detach_args = dict(template_id=copies[2], actor=actor, if_match='"2"', idempotency_key=key + "-detached",
                payload=CatalogueRepairRequest(document={"fields": [], "settings": {}},
                    reason="Approved isolated removal of invalid foreign provenance", detach_invalid_source_lineage=True))
            detached = await repair_catalogue_document(db, **detach_args)
            assert detached["version"] == 3 and await repair_catalogue_document(db, **detach_args) == detached
            async with TenantContextGuard.scoped(db, owner):
                copy = await db.get(FormTemplate, copies[2], populate_existing=True)
                assert "_source_template_id" not in copy.settings
                record = await db.scalar(select(FormTemplateReconciliation).where(
                    FormTemplateReconciliation.template_id == copies[2],
                    FormTemplateReconciliation.operation == "LINEAGE_DETACHMENT"))
                assert record.template_version == 2 and record.details["previous_source_reference_id"] == str(roots[2])
            assert tenant_org_id.get() is None
        return {"status": "PASSED", "actual_restricted_runtime": True, "foreign_history_rejected": True,
            "retired_owned_history_preserved": True, "old_valid_foreign_lineage_quarantined": True,
            "reviewed_retired_history_repair_and_replay": True, "context_restored": True,
            "explicit_invalid_history_detachment_and_replay": True, "removed_reference_history_preserved": True}
    finally:
        await async_engine.dispose()


if __name__ == "__main__":
    main()
