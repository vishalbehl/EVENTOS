"""Authorised operator constraint validation, not application acceptance testing.

Default is report-only. Execute only after migration rehearsal is authorised.
Each constraint and its mandatory audit commit together; retries inspect committed
validation state. Connection credentials are never included in output.
"""
import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

sys.path.insert(0, str(Path(__file__).parents[1]))
from app.core.ownership_constraints import PHASE1_OWNERSHIP_CONSTRAINTS
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from category_a_phase1_reconcile import summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--organization", action="append", required=True, type=uuid.UUID)
    parser.add_argument("--actor", required=True, type=uuid.UUID)
    parser.add_argument("--approval-reference", required=True)
    parser.add_argument("--build-id", required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args(argv)
    cohort = sorted(set(args.organization), key=str)
    if not 1 <= len(cohort) <= 1000 or not 12 <= len(args.approval_reference.strip()) <= 200 or not 7 <= len(args.build_id.strip()) <= 128:
        parser.error("Use 1-1000 organisations, a 12-200 character approval reference and a 7-128 character build identity.")
    url = os.environ.get("MIGRATION_DATABASE_URL_SYNC", "")
    if not url:
        parser.error("Dedicated MIGRATION_DATABASE_URL_SYNC operator credentials are required.")
    engine = create_engine(url, poolclass=NullPool, connect_args={"connect_timeout": 10})
    run_id = uuid.uuid4()
    evidence = {"build_id": args.build_id, "correlation_id": str(run_id),
        "approval_reference": args.approval_reference, "execute": args.execute,
        "cohort": [], "constraints": [], "application_acceptance": "NOT_RUN"}
    try:
        with engine.begin() as connection:
            connection.execute(text("SET LOCAL statement_timeout='60s'"))
            actor_org = connection.execute(text("""SELECT u.organization_id FROM identity.users u
                JOIN platform.organizations o ON o.id=u.organization_id WHERE u.id=:actor
                AND u.is_active AND u.deleted_at IS NULL AND u.platform_role='SUPER_ADMIN'
                AND o.is_platform_org AND o.is_active AND o.suspended_at IS NULL"""), {"actor": args.actor}).scalar_one_or_none()
            if actor_org is None:
                raise RuntimeError("Approved platform operator not found")
            evidence["migration_revisions"] = list(connection.execute(text("SELECT version_num FROM alembic_version ORDER BY version_num")).scalars())
            for organization_id in cohort:
                connection.execute(text("SELECT set_config('app.current_organization_id',:org,true)"), {"org": str(organization_id)})
                customer = connection.execute(text("SELECT id FROM platform.organizations WHERE id=:org AND NOT is_platform_org"),
                    {"org": organization_id}).scalar_one_or_none()
                if customer is None:
                    raise RuntimeError("Cohort must contain existing customer organisations only")
                counts = summary(connection, organization_id)
                conflicts = sum(counts[key] for key in ("events_unassigned", "events_foreign_workspace",
                    "invalid_accepted_memberships", "users_without_accepted_membership", "relationship_kind_conflicts",
                    "duplicate_managing_relationships", "invalid_event_assignments", "classification_conflicts",
                    "legacy_lifecycle_conflicts", "unexplained_event_assignments", "missing_relationship_consent")) + int(counts["accepted_active_owners"] == 0)
                evidence["cohort"].append({"organization_id": str(organization_id), "counts": counts,
                    "status": "QUARANTINED" if conflicts else "RECONCILED_SOURCE_OWNERSHIP"})
            if any(item["status"] == "QUARANTINED" for item in evidence["cohort"]):
                evidence["status"] = "BLOCKED_RECONCILIATION"
                print(json.dumps(evidence)); return 2
        for schema, table, name in PHASE1_OWNERSHIP_CONSTRAINTS:
            with engine.begin() as connection:
                connection.execute(text("SET LOCAL lock_timeout='5s'"))
                connection.execute(text("SET LOCAL statement_timeout='600s'"))
                found = connection.execute(text("""SELECT c.convalidated,c.contype FROM pg_constraint c
                    JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
                    WHERE n.nspname=:schema AND t.relname=:table AND c.conname=:name"""),
                    {"schema": schema, "table": table, "name": name}).mappings().one_or_none()
                if found is None or found["contype"] != ("c" if name.startswith("ck_") else "f"):
                    raise RuntimeError("Required ownership constraint missing or wrong type")
                validated = bool(found["convalidated"])
                if args.execute and not validated:
                    # Identifiers are exclusively from the immutable source allowlist.
                    connection.execute(text(f'ALTER TABLE "{schema}"."{table}" VALIDATE CONSTRAINT "{name}"'))
                    values = {"id": uuid.uuid4(), "actor_user_id": args.actor, "actor_role": "SUPER_ADMIN",
                        "organization_id": actor_org, "impersonated_by": None,
                        "resource_type": "database_constraint", "resource_id": uuid.uuid5(uuid.NAMESPACE_URL, f"{schema}.{table}.{name}"),
                        "action_type": "FOUNDATION_CONSTRAINT_VALIDATED", "old_state": {"validated": False},
                        "new_state": {"schema": schema, "table": table, "constraint": name, "validated": True,
                            "build_id": args.build_id, "acting_organization_id": str(actor_org)},
                        "change_diff": {"reason": args.approval_reference}, "correlation_id": run_id,
                        "occurred_at": datetime.now(timezone.utc), "is_sensitive": True, "hash_version": 2}
                    values["row_hash"] = compute_audit_hash(SimpleNamespace(**values), version=2)
                    connection.execute(text("SELECT set_config('app.current_organization_id',:org,true)"), {"org": str(actor_org)})
                    connection.execute(AuditLog.__table__.insert().values(**values))
                    validated = True
            evidence["constraints"].append({"schema": schema, "table": table, "name": name, "validated": validated})
        passed = all(item["validated"] for item in evidence["constraints"])
        evidence["status"] = "CONSTRAINTS_VALIDATED" if passed else "VALIDATION_PENDING"
        print(json.dumps(evidence)); return 0 if passed else 2
    except Exception as error:
        evidence["status"] = "VALIDATION_FAILED"
        evidence["error_type"] = type(error).__name__
        print(json.dumps(evidence)); return 1
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
