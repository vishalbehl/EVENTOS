"""Lossless reviewed repair of two named isolated upload-test fixtures only.

Report-only by default. Never resets fields, approves arbitrary tenants, or runs
against the default application database. Credentials remain process-local.
"""
import argparse
import asyncio
import json
from pathlib import Path
import secrets
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from app.config import settings
from bootstrap_cloud_database import upsert_login
from app.modules.registration.schemas.event_form_contracts import form_document

OWNER = uuid.UUID("0a62c7fc-5ee2-40fb-871c-2c74d59098cf")
ACTOR = uuid.UUID("cc935543-0b19-4495-a955-8485c6890e13")
FIXTURES = (
    uuid.UUID("1cbfa59e-e250-49ee-b625-edf1a3fbd76e"),
    uuid.UUID("3fd1c835-7682-439c-ae17-c4803ef347e3"),
)
REASON = "Reviewed lossless required-flag canonicalisation of authorised isolated upload-test fixtures."


def snapshots(engine):
    results = []
    with engine.connect() as connection, connection.begin():
        connection.execute(text("SET TRANSACTION READ ONLY"))
        connection.execute(text("SET LOCAL statement_timeout='15s'"))
        platform = connection.execute(text("""SELECT u.organization_id FROM identity.users u
            JOIN platform.organizations o ON o.id=u.organization_id
            WHERE u.id=:actor AND u.is_active AND o.is_platform_org AND o.is_active
              AND o.archived_at IS NULL AND o.suspended_at IS NULL"""), {"actor": ACTOR}).scalar_one()
        for resource_id in FIXTURES:
            row = connection.execute(text("""SELECT f.id,f.event_id,f.version,f.fields,f.settings,f.is_live,
                e.name,e.organization_id,o.is_platform_org
                FROM registration.registration_forms f JOIN events.events e ON e.id=f.event_id
                JOIN platform.organizations o ON o.id=e.organization_id
                WHERE f.id=:id AND e.organization_id=:owner"""),
                {"id": resource_id, "owner": OWNER}).mappings().one()
            if (row["is_platform_org"] or row["is_live"] or row["version"] not in (1, 2)
                    or row["name"] != f"Category A isolated public upload proof {row['event_id']}"
                    or len(row["fields"]) != 1 or row["fields"][0].get("type") != "file"
                    or row["settings"]):
                raise RuntimeError("Fixture provenance/state changed; explicit new review is required")
            document = form_document(row["fields"], row["settings"], stored=True, event_id=row["event_id"])
            # This maintenance never removes a question or relaxes its limits.
            previous = dict(row["fields"][0])
            required = previous.pop("required", previous.get("is_required"))
            for key, value in previous.items():
                if document["fields"][0].get(key) != value:
                    raise RuntimeError("Proposed repair changes existing field semantics")
            if type(required) is not bool or document["fields"][0]["is_required"] != required:
                raise RuntimeError("Proposed repair changes required semantics")
            key = f"category-a-reviewed-required-20261017-{resource_id}"
            receipt = connection.execute(text("""SELECT id,response_body,status,actor_id
                FROM platform.idempotency_records WHERE organization_id=:platform
                  AND operation='registration.platform.aggregate-repair.registration_form'
                  AND idempotency_key=:key"""), {"platform": platform, "key": key}).mappings().one_or_none()
            if receipt is not None and (receipt["status"] != "COMPLETED" or receipt["actor_id"] != ACTOR
                    or receipt["response_body"].get("version") != row["version"]):
                raise RuntimeError("Existing receipt does not match the reviewed fixture")
            if receipt is None and (row["version"] != 1 or "required" not in row["fields"][0]):
                raise RuntimeError("Unrecorded fixture change requires explicit new review")
            results.append({"id": resource_id, "event_id": row["event_id"], "version": 1,
                "document": document, "key": key, "was_legacy": "required" in row["fields"][0]})
    return platform, results


async def apply_reviewed(platform, candidates):
    import app.models
    from app.database import AsyncSessionLocal, async_engine
    from app.core.tenant_context import TenantContextGuard
    from app.modules.identity.models.user import User
    from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
    from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest
    results = []
    try:
        async with AsyncSessionLocal() as db:
            role = (await db.execute(text("""SELECT r.rolsuper,r.rolbypassrls,
                EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                    WHERE c.relkind IN ('r','p') AND n.nspname IN
                      ('platform','identity','design','registration','abstract','events','organizer_access','command_center_audit')
                      AND pg_has_role(current_user,c.relowner,'USAGE')) AS owns_application_table
                FROM pg_roles r WHERE r.rolname=current_user"""))).one()
            if role.rolsuper or role.rolbypassrls or role.owns_application_table:
                raise RuntimeError("A restricted runtime login is required")
            async with TenantContextGuard.scoped(db, platform):
                actor = await db.get(User, ACTOR)
            for candidate in candidates:
                arguments = dict(resource_type="REGISTRATION_FORM", resource_id=candidate["id"],
                    actor=actor, if_match='"1"', idempotency_key=candidate["key"],
                    payload=AggregateRepairRequest(document=candidate["document"], reason=REASON))
                result = await repair_aggregate_document(db, **arguments)
                if result != await repair_aggregate_document(db, **arguments):
                    raise RuntimeError("Reviewed repair replay differs")
                results.append(result)
        return results
    finally:
        await async_engine.dispose()


async def revalidate_cohort(cohort):
    """Exercise the existing bounded worker pages, not a second validator."""
    from app.tasks import catalogue_reconciliation as worker
    from app.database import async_engine
    summaries = []

    async def consume(stage, owner, action):
        cursor = None
        totals = {"stage": stage, "organization_id": str(owner) if owner else None,
            "pages": 0, "checked": 0, "blocked": 0, "normalized": 0}
        for _ in range(10000):
            page = await action(cursor)
            totals["pages"] += 1
            for key in ("checked", "blocked", "normalized"):
                totals[key] += page[key]
            if not page["next_cursor"]:
                summaries.append(totals)
                return
            following = uuid.UUID(page["next_cursor"])
            if cursor is not None and following <= cursor:
                raise RuntimeError("Reconciliation cursor did not advance")
            cursor = following
        raise RuntimeError("Bounded rehearsal budget exhausted; cohort remains incomplete")

    try:
        await consume("GLOBAL_CATEGORY", None, lambda cursor: worker._global_category_page(ACTOR, cursor))
        await consume("GLOBAL_TEMPLATE", None, lambda cursor: worker._global_template_page(ACTOR, cursor))
        for entry in cohort:
            owner = uuid.UUID(entry["organization_id"])
            for stage in worker._STAGES:
                await consume(stage, owner, lambda cursor: worker._process_page(owner, ACTOR, stage, cursor))
        return summaries
    finally:
        await async_engine.dispose()


def verify(engine, platform, candidates):
    from types import SimpleNamespace
    from app.modules.audit.models.audit_log import compute_audit_hash
    with engine.connect() as connection, connection.begin():
        connection.execute(text("SET TRANSACTION READ ONLY"))
        for candidate in candidates:
            row = connection.execute(text("""SELECT fields,settings,version,is_live FROM registration.registration_forms
                WHERE id=:id AND event_id=:event"""), {"id": candidate["id"], "event": candidate["event_id"]}).mappings().one()
            if (row["version"] != 2 or row["is_live"] or row["fields"] != candidate["document"]["fields"]
                    or row["settings"] != candidate["document"]["settings"]):
                raise RuntimeError("Persisted repair differs from the reviewed document")
            history = set(connection.execute(text("""SELECT resource_version,operation,status
                FROM design.catalogue_document_reconciliations WHERE resource_type='REGISTRATION_FORM'
                  AND resource_id=:id AND organization_id=:owner"""), {"id": candidate["id"], "owner": OWNER}).all())
            if history != {(1, "DOCUMENT_VALIDATION", "BLOCKED"), (1, "EXPLICIT_REPAIR", "COMPLETED"),
                    (2, "DOCUMENT_VALIDATION", "VALID")}:
                raise RuntimeError("Immutable reviewed repair history differs")
            count = connection.execute(text("""SELECT count(*) FROM command_center_audit.logs a
                JOIN platform.idempotency_records r ON r.id=a.correlation_id
                WHERE a.resource_id=:id AND a.actor_user_id=:actor AND a.organization_id=:owner
                  AND a.action_type='CATALOGUE_AGGREGATE_EXPLICIT_REPAIR' AND length(a.row_hash)=64
                  AND r.organization_id=:platform AND r.idempotency_key=:key AND r.status='COMPLETED'"""),
                {"id": candidate["id"], "actor": ACTOR, "owner": OWNER, "platform": platform, "key": candidate["key"]}).scalar_one()
            if count != 1:
                raise RuntimeError("Mandatory audit/receipt count differs")
            audit = connection.execute(text("""SELECT a.* FROM command_center_audit.logs a
                JOIN platform.idempotency_records r ON r.id=a.correlation_id
                WHERE a.resource_id=:id AND r.organization_id=:platform AND r.idempotency_key=:key"""),
                {"id": candidate["id"], "platform": platform, "key": candidate["key"]}).mappings().one()
            if audit["hash_version"] != 2 or compute_audit_hash(SimpleNamespace(**audit)) != audit["row_hash"]:
                raise RuntimeError("Mandatory audit integrity digest differs")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply-reviewed", action="store_true")
    parser.add_argument("--revalidate-cohort", action="store_true",
        help="Also run every existing worker stage for the fixed approved local cohort")
    args = parser.parse_args()
    if args.revalidate_cohort and not args.apply_reviewed:
        parser.error("Cohort worker execution requires --apply-reviewed")
    target = make_url(settings.DATABASE_URL_SYNC).set(database="category_a_rehearsal_20261015")
    if settings.is_production or target.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the explicitly named local rehearsal database is permitted")
    engine = create_engine(target)
    try:
        platform, candidates = snapshots(engine)
        cohort = None
        if args.revalidate_cohort:
            from category_a_phase1_cohort import load_cohort
            cohort = load_cohort(Path(__file__).parents[3] /
                "docs/category-a/plans-status-evidence/2026-10-15/rehearsal-cohort.json")
            with engine.connect() as connection, connection.begin():
                connection.execute(text("SET TRANSACTION READ ONLY"))
                for entry in cohort:
                    actual = connection.execute(text("""SELECT organization_kind FROM platform.organizations
                        WHERE id=:id AND NOT is_platform_org AND is_active
                          AND archived_at IS NULL AND suspended_at IS NULL"""),
                        {"id": uuid.UUID(entry["organization_id"])}).scalar_one()
                    if actual != entry["confirmed_kind"]:
                        raise RuntimeError("Cohort classification differs from its approved manifest")
        result = {"status": "REVIEWED_PLAN", "database": target.database,
            "resources": [str(item["id"]) for item in candidates], "questions_removed": 0,
            "required_and_upload_limits_preserved": True, "changed": False}
        if args.apply_reviewed:
            secret = secrets.token_urlsafe(40)
            raw = engine.raw_connection()
            try:
                with raw.cursor() as cursor:
                    upsert_login(cursor, "category_a_rehearsal_runtime_20261015", secret, "event_runtime")
                raw.commit()
            finally:
                raw.close()
            settings.DATABASE_URL_ASYNC = target.set(drivername="postgresql+asyncpg",
                username="category_a_rehearsal_runtime_20261015", password=secret).render_as_string(hide_password=False)
            result["repairs"] = asyncio.run(apply_reviewed(platform, candidates))
            verify(engine, platform, candidates)
            result.update(status="PASSED", changed=any(item["was_legacy"] for item in candidates), replay_verified=True,
                persisted_documents_audits_and_history_verified=True, restricted_non_owner_role_verified=True,
                audit_digests_verified=True)
            if cohort is not None:
                result["cohort_revalidation"] = asyncio.run(revalidate_cohort(cohort))
                if any(item["blocked"] for item in result["cohort_revalidation"]):
                    result["status"] = "COHORT_BLOCKED"
                result["changed"] |= any(item["normalized"] for item in result["cohort_revalidation"])
            output = Path(__file__).parents[1] / "test-results/category-a-reviewed-upload-form-repair.json"
            output.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps(result, indent=2))
        return 0 if result["status"] in {"PASSED", "REVIEWED_PLAN"} else 2
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
