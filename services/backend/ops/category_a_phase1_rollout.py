"""Approved whole-cohort orchestration. Never executed by application startup.

Separate preflight, restartable ownership backfill and constraint validation.
Uses the existing reconciliation implementation; never infers memberships or
classification. Only a dedicated migrator/operator connection is accepted.
"""
from __future__ import annotations

import argparse
from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, text
from category_a_phase1_reconcile import main as reconcile, summary
from category_a_migration_path import require_context_expansion


CONFLICTS = (
    "events_foreign_workspace", "invalid_accepted_memberships",
    "users_without_accepted_membership", "relationship_kind_conflicts",
    "duplicate_managing_relationships", "invalid_event_assignments",
    "classification_conflicts", "legacy_lifecycle_conflicts",
    "unexplained_event_assignments", "missing_relationship_consent",
)
CONSTRAINTS = (
    ("events.events", "ck_event_workspace_required"),
    ("automation.workflow_tasks", "ck_workflow_task_version_positive"),
)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", required=True, choices=("preflight", "backfill", "validate"))
    parser.add_argument("--cohort", required=True, type=Path)
    parser.add_argument("--actor", required=True, type=uuid.UUID)
    parser.add_argument("--approval-reference", required=True)
    parser.add_argument("--build-id")
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args(argv)
    if args.phase == "validate" and (not args.build_id or not 7 <= len(args.build_id.strip()) <= 128):
        parser.error("Constraint validation requires a 7-128 character build identity.")
    if not 1 <= args.batch_size <= 1000 or not 12 <= len(args.approval_reference.strip()) <= 200:
        parser.error("Use batch size 1-1000 and approval reference 12-200 characters.")
    # Bound input before parsing. No caller-controlled SQL identifiers are used.
    if args.cohort.stat().st_size > 2 * 1024 * 1024:
        parser.error("Cohort manifest exceeds 2 MiB.")
    data = json.loads(args.cohort.read_text(encoding="utf-8"))
    if not isinstance(data, list) or not 1 <= len(data) <= 10000:
        parser.error("Provide 1-10000 explicitly approved customer organisations.")
    cohort = {}
    for row in data:
        if not isinstance(row, dict) or set(row) != {"organization_id", "confirmed_kind"}:
            parser.error("Each entry requires organization_id and confirmed_kind only.")
        org = uuid.UUID(row["organization_id"])
        kind = row["confirmed_kind"]
        if org in cohort or kind not in {"NORMAL", "EMC", "CLIENT"}:
            parser.error("Duplicate organisation or invalid confirmed classification.")
        cohort[org] = kind
    url = os.environ.get("MIGRATION_DATABASE_URL_SYNC")
    if not url:
        parser.error("Dedicated MIGRATION_DATABASE_URL_SYNC is required.")
    engine = create_engine(url, pool_size=1, max_overflow=0, pool_pre_ping=True)
    run_id = str(uuid.uuid4())
    try:
        with engine.begin() as connection:
            connection.execute(text("SET LOCAL statement_timeout = '30s'"))
            migration_path = require_context_expansion(connection)
            actor = connection.execute(text("SELECT u.id FROM identity.users u "
                "JOIN platform.organizations o ON o.id=u.organization_id "
                "WHERE u.id=:actor AND u.is_active AND u.deleted_at IS NULL "
                "AND u.platform_role='SUPER_ADMIN' AND o.is_platform_org "
                "AND o.is_active AND o.suspended_at IS NULL"),
                {"actor": args.actor}).scalar_one_or_none()
            if actor is None:
                raise RuntimeError("Approved active platform operator not found.")
        inventory = {}
        after = uuid.UUID(int=0)
        while True:
            with engine.begin() as connection:
                connection.execute(text("SET LOCAL statement_timeout = '30s'"))
                rows = connection.execute(text("SELECT id, organization_kind FROM platform.organizations "
                    "WHERE NOT is_platform_org AND id > :after ORDER BY id LIMIT 100"),
                    {"after": after}).mappings().all()
            if not rows:
                break
            inventory.update((row["id"], row["organization_kind"]) for row in rows)
            if len(inventory) > 10000:
                raise RuntimeError("Cohort exceeds approved tool capacity; do not silently truncate.")
            after = rows[-1]["id"]
        if inventory != cohort:
            raise RuntimeError("Whole customer cohort/classifications do not match explicit approvals.")
        blocked = []
        for org in sorted(cohort):
            with engine.begin() as connection:
                connection.execute(text("SET LOCAL statement_timeout = '30s'"))
                connection.execute(text("SELECT set_config('app.current_organization_id', :org, true)"),
                    {"org": str(org)})
                result = summary(connection, org)
            if (any(result[key] for key in CONFLICTS) or result["accepted_active_owners"] == 0 or
                    (args.phase == "validate" and result["events_unassigned"])):
                blocked.append({"organization_id": str(org), "summary": result})
        if blocked:
            print(json.dumps({"run_id": run_id, "phase": args.phase, "status": "QUARANTINED",
                "applied": False, "conflicts": blocked}))
            return 2
        if args.phase == "backfill":
            for org, kind in sorted(cohort.items()):
                output = io.StringIO()
                with redirect_stdout(output):
                    status = reconcile(["--organization", str(org), "--actor", str(args.actor),
                        "--confirmed-kind", kind, "--approval-reference", args.approval_reference,
                        "--batch-size", str(args.batch_size), "--apply-ownership-backfill"])
                print(output.getvalue().strip())
                if status:
                    return status  # Previously committed batches remain restartable.
        elif args.phase == "validate":
            for table, constraint in CONSTRAINTS:
                with engine.begin() as connection:
                    connection.execute(text("SET LOCAL lock_timeout = '5s'"))
                    connection.execute(text("SET LOCAL statement_timeout = '60s'"))
                    exists = connection.execute(text("SELECT convalidated FROM pg_constraint "
                        "WHERE conrelid = to_regclass(:table) AND conname = :constraint"),
                        {"table": table, "constraint": constraint}).scalar_one_or_none()
                    if exists is None:
                        raise RuntimeError(f"Required expanded constraint is missing: {constraint}")
                    if not exists:
                        connection.execute(text(f"ALTER TABLE {table} VALIDATE CONSTRAINT {constraint}"))
            # The two rollout-local checks are not the complete ownership gate.
            # Reuse the audited canonical validator before reporting success.
            from category_a_phase1_validate import main as validate_ownership
            arguments = ["--actor", str(args.actor), "--approval-reference", args.approval_reference,
                "--build-id", args.build_id, "--execute"]
            for organization_id in sorted(cohort):
                arguments.extend(["--organization", str(organization_id)])
            output = io.StringIO()
            with redirect_stdout(output):
                status = validate_ownership(arguments)
            validation = json.loads(output.getvalue())
            if status or validation.get("status") != "CONSTRAINTS_VALIDATED":
                print(json.dumps({"run_id": run_id, "phase": args.phase,
                    "status": "VALIDATION_BLOCKED", "ownership_validation": validation,
                    "constraints_validated": False, "release_accepted": False}))
                return status or 2
        print(json.dumps({"run_id": run_id, "phase": args.phase,
            "status": "SOURCE_ROLLOUT_STEP_COMPLETED", "organizations": len(cohort),
            "migration_path": migration_path,
            "constraints_validated": args.phase == "validate", "release_accepted": False}))
        return 0
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
