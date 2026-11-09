"""Committed scoped taxonomy repair across global and two synthetic customer owners."""
import asyncio
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
        raise RuntimeError("Only the explicitly isolated local rehearsal is permitted")
    cohort = json.loads((Path(__file__).parents[3] /
        "docs/category-a/plans-status-evidence/2026-10-15/rehearsal-cohort.json").read_text(encoding="utf-8"))
    owners = [uuid.UUID(row["organization_id"]) for row in cohort[:2]]
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
            {"ids": owners}).scalar_one() == 2
    settings.DATABASE_URL_ASYNC = target.set(drivername="postgresql+asyncpg",
        username="category_a_rehearsal_runtime_20261015", password=secret).render_as_string(hide_password=False)
    import app.models
    from app.modules.registration.models.form_category import FormCategory
    from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
    category_id, template_ids = uuid.uuid4(), [uuid.uuid4() for _ in range(3)]
    foreign_category_id = uuid.uuid4()
    unsafe_template_ids = [uuid.uuid4(), uuid.uuid4()]
    all_template_ids = template_ids + unsafe_template_ids
    key = f"category-key-proof-{uuid.uuid4()}"
    old_slug, new_slug = f"old-{category_id.hex}", f"new-{category_id.hex}"
    try:
        with Session(engine) as db:
            db.add(FormCategory(id=category_id, name="", slug=old_slug))
            db.add(FormCategory(id=foreign_category_id, organization_id=owners[1],
                name="Foreign reference runtime proof", slug=f"foreign-{foreign_category_id.hex}"))
            db.flush()
            for template_id, owner in zip(template_ids, [None, *owners]):
                db.add(FormTemplate(id=template_id, organization_id=owner,
                    scope_type="GLOBAL" if owner is None else "ORGANIZATION",
                    category_id=category_id, category_key=old_slug, name="Category key runtime proof",
                    slug=f"proof-{template_id.hex}", fields=[], settings={"custom_js": "historical blocked setting"}))
            db.flush()
            db.add_all([FormTemplateReconciliation(template_id=i, template_version=1,
                operation="DOCUMENT_VALIDATION", status="BLOCKED") for i in template_ids])
            for template_id, owner in zip(unsafe_template_ids, [None, owners[0]]):
                db.add(FormTemplate(id=template_id, organization_id=owner,
                    scope_type="GLOBAL" if owner is None else "ORGANIZATION",
                    category_id=foreign_category_id, category_key=f"foreign-{foreign_category_id.hex}",
                    name="Unsafe historical reference proof", slug=f"unsafe-{template_id.hex}",
                    fields=[], settings={}))
            db.flush()
            db.add_all([FormTemplateReconciliation(template_id=i, template_version=1,
                operation="DOCUMENT_VALIDATION", status="VALID", details={"historical": True})
                for i in unsafe_template_ids])
            db.commit()
        result = asyncio.run(probe(actor_id, platform, owners, category_id, template_ids, new_slug, key,
            foreign_category_id, unsafe_template_ids))
    finally:
        # Exact generated fixtures only, never actor-wide receipt/history deletion.
        with engine.begin() as connection:
            connection.execute(text("DELETE FROM platform.idempotency_records WHERE idempotency_key=ANY(:keys)"),
                {"keys": [key, *(f"ref-{key}-{i}" for i in unsafe_template_ids)]})
            connection.execute(text("DELETE FROM command_center_audit.logs WHERE resource_id=:id OR resource_id=ANY(:ids)"),
                {"id": category_id, "ids": all_template_ids})
            connection.execute(text("DELETE FROM design.form_template_reconciliations WHERE template_id=ANY(:ids)"), {"ids": all_template_ids})
            connection.execute(text("DELETE FROM design.form_templates WHERE id=ANY(:ids)"), {"ids": all_template_ids})
            connection.execute(text("DELETE FROM design.form_category_reconciliations WHERE category_id=:id"), {"id": category_id})
            connection.execute(text("DELETE FROM design.form_categories WHERE id=:id"), {"id": category_id})
            connection.execute(text("DELETE FROM design.form_categories WHERE id=:id"), {"id": foreign_category_id})
        engine.dispose()
    print(json.dumps({**result, "generated_fixtures_removed": True}, indent=2))


async def probe(actor_id, platform, owners, category_id, template_ids, new_slug, key,
                foreign_category_id, unsafe_template_ids):
    from app.database import AsyncSessionLocal, async_engine, tenant_org_id
    from app.core.database_security import inspect_database_security
    from app.core.tenant_context import TenantContextGuard
    from app.modules.identity.models.user import User
    from app.modules.audit.models.audit_log import AuditLog
    from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
    from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest
    from app.modules.registration.schemas.catalogue_contracts import CatalogueRepairRequest
    from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
    from app.modules.registration.application.template_commands import repair_catalogue_document
    from app.tasks.catalogue_reconciliation import _global_category_page, _global_template_page, _process_page
    try:
        async with AsyncSessionLocal() as db:
            assert (await inspect_database_security(db)).runtime_role_is_safe
        first = await _global_category_page(actor_id, None)
        second = await _global_category_page(actor_id, None)
        assert first["blocked"] >= 1 and second["blocked"] == first["blocked"]
        async with AsyncSessionLocal() as db:
            async with TenantContextGuard.scoped(db, platform):
                actor = await db.get(User, actor_id)
            args = dict(resource_type="FORM_CATEGORY", resource_id=category_id,
                payload=AggregateRepairRequest(document={"name": "Reviewed global category", "slug": new_slug,
                    "description": None, "icon": None, "sort_order": 0},
                    reason="Approved synthetic global taxonomy key repair"),
                actor=actor, if_match='"1"', idempotency_key=key)
            result = await repair_aggregate_document(db, **args)
            assert result["version"] == 2 and await repair_aggregate_document(db, **args) == result
            assert tenant_org_id.get() is None
            for template_id, owner in zip(template_ids, [None, *owners]):
                async with TenantContextGuard.scoped(db, owner or platform):
                    template = await db.scalar(select(FormTemplate).where(FormTemplate.id == template_id)
                        .execution_options(shared_form_catalogue=True, populate_existing=True))
                    assert template.version == 2 and template.category_key == new_slug
                    evidence = (await db.scalars(select(FormTemplateReconciliation).where(
                        FormTemplateReconciliation.template_id == template_id))).all()
                    assert {(r.template_version, r.operation, r.status) for r in evidence} == {
                        (1, "DOCUMENT_VALIDATION", "BLOCKED"), (2, "DOCUMENT_VALIDATION", "BLOCKED"),
                        (2, "CATEGORY_KEY_NORMALIZATION", "COMPLETED")}
            async with TenantContextGuard.scoped(db, platform):
                audit = (await db.scalars(select(AuditLog).where(AuditLog.resource_id == category_id,
                    AuditLog.action_type == "CATALOGUE_AGGREGATE_EXPLICIT_REPAIR"))).one()
                assert audit.new_state["templates_updated"] == 3 and audit.new_state["blocked_template_evidence_carried"] == 3
        for _ in range(2):
            await _global_template_page(actor_id, None)
            await _process_page(owners[0], actor_id, "FORM_TEMPLATE", None)
        async with AsyncSessionLocal() as db:
            for template_id, owner in zip(unsafe_template_ids, [platform, owners[0]]):
                async with TenantContextGuard.scoped(db, owner):
                    template = await db.scalar(select(FormTemplate).where(FormTemplate.id == template_id)
                        .execution_options(shared_form_catalogue=True))
                    assert template.version == 2 and template.category_id == foreign_category_id
                    evidence = (await db.scalars(select(FormTemplateReconciliation).where(
                        FormTemplateReconciliation.template_id == template_id))).all()
                    assert {(r.template_version, r.operation, r.status) for r in evidence} == {
                        (1, "DOCUMENT_VALIDATION", "VALID"), (1, "REFERENCE_VALIDATION", "BLOCKED"),
                        (2, "DOCUMENT_VALIDATION", "BLOCKED")}
                    assert next(r for r in evidence if r.template_version == 1
                        and r.operation == "DOCUMENT_VALIDATION").details == {"historical": True}
                    assert all(str(foreign_category_id) not in str(r.details) for r in evidence)
            assert tenant_org_id.get() is None
        for template_id, owner in zip(unsafe_template_ids, [platform, owners[0]]):
            async with AsyncSessionLocal() as db:
                async with TenantContextGuard.scoped(db, platform):
                    actor = await db.get(User, actor_id)
                args = dict(template_id=template_id, actor=actor, if_match='"2"',
                    idempotency_key=f"ref-{key}-{template_id}",
                    payload=CatalogueRepairRequest(document={"fields": [], "settings": {}},
                        replacement_category_id=category_id,
                        reason="Approved synthetic document and reference correction"))
                repaired = await repair_catalogue_document(db, **args)
                assert repaired["version"] == 3 and await repair_catalogue_document(db, **args) == repaired
                async with TenantContextGuard.scoped(db, owner):
                    template = await db.scalar(select(FormTemplate).where(FormTemplate.id == template_id)
                        .execution_options(shared_form_catalogue=True, populate_existing=True))
                    assert template.version == 3 and template.category_id == category_id and template.category_key == new_slug
                    evidence = (await db.scalars(select(FormTemplateReconciliation).where(
                        FormTemplateReconciliation.template_id == template_id))).all()
                    assert {(r.template_version, r.operation, r.status) for r in evidence} == {
                        (1, "DOCUMENT_VALIDATION", "VALID"), (1, "REFERENCE_VALIDATION", "BLOCKED"),
                        (2, "DOCUMENT_VALIDATION", "BLOCKED"), (2, "EXPLICIT_REPAIR", "COMPLETED"),
                        (3, "DOCUMENT_VALIDATION", "VALID")}
                    audit = (await db.scalars(select(AuditLog).where(AuditLog.resource_id == template_id,
                        AuditLog.action_type == "FORM_TEMPLATE_EXPLICIT_REPAIR"))).one()
                    assert audit.new_state["category_id"] == str(category_id)
                assert tenant_org_id.get() is None
        return {"status": "PASSED", "actual_restricted_runtime": True, "committed_template_updates": 3,
            "direct_customer_owners": 2, "global_source_updated": True,
            "immutable_lineage_per_template": True, "blocked_history_carried": True,
            "repair_replay": True, "existing_blockers_counted": True, "context_restored": True,
            "old_valid_foreign_references_quarantined": 2, "old_valid_history_preserved": True,
            "reference_retry_does_not_repeat_version_change": True,
            "reviewed_category_document_repairs_committed": 2, "reviewed_repair_replay": True}
    finally:
        await async_engine.dispose()


if __name__ == "__main__":
    main()
