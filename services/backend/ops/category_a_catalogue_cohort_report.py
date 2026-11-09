"""Report current-version catalogue reconciliation coverage for an approved cohort.

Read-only and fail closed. This report does not repair, approve, or infer any
document or taxonomy decision. Run only after the catalogue migration chain and
bounded reconciliation workers have completed for the selected cohort.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import uuid

from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parents[1]))
from category_a_phase1_cohort import load_cohort
from category_a_catalogue_policy_metadata import SHARED_CATALOGUE_QUERY, shared_catalogue_structure_is_safe


REQUIRED_REVISION = "20261022_3670"
COHORT_RESOURCE_TYPES = (
    "FORM_CATEGORY",
    "FORM_TEMPLATE",
    "REGISTRATION_FORM",
    "ABSTRACT_FORM",
    "PROGRAMME_RUBRIC",
)

REQUIRED_RLS_POLICIES = {
    "form_template_reconciliations": {
        "category_a_form_template_reconciliations_read",
        "category_a_form_template_reconciliations_append",
    },
    "form_category_reconciliations": {
        "category_a_form_category_reconciliations_read",
        "category_a_form_category_reconciliations_append",
    },
    "catalogue_document_reconciliations": {
        "category_a_catalogue_document_reconciliations_read",
        "category_a_catalogue_document_reconciliations_append",
    },
    "catalogue_reconciliation_runs": {
        "category_a_catalogue_reconciliation_runs_tenant",
    },
}

RLS_METADATA_SQL = text("""
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
           coalesce(array_agg(p.polname) FILTER (WHERE p.polname IS NOT NULL),
                    ARRAY[]::name[]) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_policy p ON p.polrelid=c.oid
     WHERE n.nspname='design' AND c.relname::text=ANY(CAST(:tables AS text[]))
     GROUP BY c.oid
""")


COHORT_COVERAGE_SQL = text("""
    SELECT fc.organization_id, 'FORM_CATEGORY' AS resource_type,
           count(*) AS total,
           count(*) FILTER (WHERE evidence.id IS NULL) AS missing,
           count(*) FILTER (WHERE evidence.status='BLOCKED') AS blocked
      FROM design.form_categories fc
      LEFT JOIN design.catalogue_document_reconciliations evidence
        ON evidence.resource_type='FORM_CATEGORY'
       AND evidence.resource_id=fc.id
       AND evidence.resource_version=fc.version
       AND evidence.operation='DOCUMENT_VALIDATION'
     WHERE fc.organization_id=ANY(:organizations)
       AND fc.deleted_at IS NULL AND fc.is_active=true
     GROUP BY fc.organization_id
    UNION ALL
    SELECT template.organization_id, 'FORM_TEMPLATE', count(*),
           count(*) FILTER (WHERE evidence.id IS NULL),
           count(*) FILTER (WHERE evidence.status='BLOCKED')
      FROM design.form_templates template
      LEFT JOIN design.form_template_reconciliations evidence
        ON evidence.template_id=template.id
       AND evidence.template_version=template.version
       AND evidence.operation='DOCUMENT_VALIDATION'
     WHERE template.organization_id=ANY(:organizations)
       AND template.deleted_at IS NULL
     GROUP BY template.organization_id
    UNION ALL
    SELECT event.organization_id, 'REGISTRATION_FORM', count(*),
           count(*) FILTER (WHERE evidence.id IS NULL),
           count(*) FILTER (WHERE evidence.status='BLOCKED')
      FROM registration.registration_forms form
      JOIN events.events event ON event.id=form.event_id
      LEFT JOIN design.catalogue_document_reconciliations evidence
        ON evidence.resource_type='REGISTRATION_FORM'
       AND evidence.resource_id=form.id
       AND evidence.resource_version=form.version
       AND evidence.operation='DOCUMENT_VALIDATION'
     WHERE event.organization_id=ANY(:organizations)
     GROUP BY event.organization_id
    UNION ALL
    SELECT form.organization_id, 'ABSTRACT_FORM', count(*),
           count(*) FILTER (WHERE evidence.id IS NULL),
           count(*) FILTER (WHERE evidence.status='BLOCKED')
      FROM abstract.abstract_forms form
      LEFT JOIN design.catalogue_document_reconciliations evidence
        ON evidence.resource_type='ABSTRACT_FORM'
       AND evidence.resource_id=form.id
       AND evidence.resource_version=form.version
       AND evidence.operation='DOCUMENT_VALIDATION'
     WHERE form.organization_id=ANY(:organizations)
     GROUP BY form.organization_id
    UNION ALL
    SELECT plan.organization_id, 'PROGRAMME_RUBRIC', count(*),
           count(*) FILTER (WHERE evidence.id IS NULL),
           count(*) FILTER (WHERE evidence.status='BLOCKED')
      FROM programme.evaluation_plans plan
      LEFT JOIN design.catalogue_document_reconciliations evidence
        ON evidence.resource_type='PROGRAMME_RUBRIC'
       AND evidence.resource_id=plan.id
       AND evidence.resource_version=plan.version
       AND evidence.operation='DOCUMENT_VALIDATION'
     WHERE plan.organization_id=ANY(:organizations)
     GROUP BY plan.organization_id
""")


GLOBAL_COVERAGE_SQL = text("""
    SELECT 'FORM_CATEGORY' AS resource_type, count(*) AS total,
           count(*) FILTER (WHERE evidence.id IS NULL) AS missing,
           count(*) FILTER (WHERE evidence.status='BLOCKED') AS blocked
      FROM design.form_categories category
      LEFT JOIN design.form_category_reconciliations evidence
        ON evidence.category_id=category.id
       AND evidence.category_version=category.version
       AND evidence.operation='TAXONOMY_VALIDATION'
     WHERE category.organization_id IS NULL
       AND category.deleted_at IS NULL AND category.is_active=true
    UNION ALL
    SELECT 'FORM_TEMPLATE', count(*),
           count(*) FILTER (WHERE evidence.id IS NULL),
           count(*) FILTER (WHERE evidence.status='BLOCKED')
      FROM design.form_templates template
      LEFT JOIN design.form_template_reconciliations evidence
        ON evidence.template_id=template.id
       AND evidence.template_version=template.version
       AND evidence.operation='DOCUMENT_VALIDATION'
     WHERE template.organization_id IS NULL
       AND template.scope_type='GLOBAL' AND template.deleted_at IS NULL
""")


def _coverage_row(row) -> dict:
    return {
        "resource_type": row["resource_type"],
        "total": int(row["total"] or 0),
        "missing": int(row["missing"] or 0),
        "blocked": int(row["blocked"] or 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cohort", required=True, type=Path)
    parser.add_argument("--build-id", required=True)
    parser.add_argument("--approval-reference", required=True)
    parser.add_argument("--output", type=Path, help="Create a new JSON evidence file; never overwrite existing evidence")
    args = parser.parse_args()
    if not 7 <= len(args.build_id.strip()) <= 128:
        parser.error("Build identity must be 7-128 characters.")
    if not 12 <= len(args.approval_reference.strip()) <= 200:
        parser.error("Approval reference must be 12-200 characters.")
    cohort = load_cohort(args.cohort)
    organizations = [uuid.UUID(row["organization_id"]) for row in cohort]
    database_url = os.environ.get("MIGRATION_DATABASE_URL_SYNC", "")
    if not database_url:
        parser.error("Dedicated MIGRATION_DATABASE_URL_SYNC is required.")

    engine = create_engine(database_url, poolclass=NullPool,
        connect_args={"connect_timeout": 10})
    report = {
        "run_id": str(uuid.uuid4()),
        "build_id": args.build_id.strip(),
        "approval_reference": args.approval_reference.strip(),
        "required_revision": REQUIRED_REVISION,
        "changed": False,
        "global": [],
        "organizations": [],
    }
    try:
        with engine.connect().execution_options(isolation_level="REPEATABLE READ") as connection:
            transaction = connection.begin()
            try:
                connection.execute(text("SET TRANSACTION READ ONLY"))
                connection.execute(text("SET LOCAL statement_timeout='120s'"))
                applied = tuple(connection.execute(text(
                    "SELECT version_num FROM public.alembic_version")).scalars())
                if len(applied) != 1:
                    raise RuntimeError("Expected exactly one applied Alembic head.")
                scripts = ScriptDirectory(str(Path(__file__).parents[1] / "alembic"))
                ancestors = {revision.revision for revision in
                    scripts.iterate_revisions(applied[0], "base")}
                if REQUIRED_REVISION not in ancestors:
                    raise RuntimeError("Catalogue reconciliation migrations are incomplete.")
                report["applied_revision"] = applied[0]
                report["inspection_role"] = connection.scalar(text("SELECT current_user"))
                shared = [dict(row) for row in connection.execute(SHARED_CATALOGUE_QUERY).mappings().all()]
                report["shared_catalogue_rls"] = shared
                if not shared_catalogue_structure_is_safe(shared, require_non_owner=False):
                    raise RuntimeError("Shared catalogue RLS/owner guards are incomplete")
                rls_rows = connection.execute(RLS_METADATA_SQL,
                    {"tables": list(REQUIRED_RLS_POLICIES)}).mappings().all()
                rls_by_table = {row["relname"]: row for row in rls_rows}
                report["rls"] = {}
                for table, expected_policies in REQUIRED_RLS_POLICIES.items():
                    row = rls_by_table.get(table)
                    if row is None or not row["relrowsecurity"] or not row["relforcerowsecurity"] \
                            or set(row["policies"] or ()) != expected_policies:
                        raise RuntimeError(
                            f"Catalogue reconciliation RLS is incomplete for design.{table}.")
                    report["rls"][table] = {
                        "enabled": True,
                        "forced": True,
                        "policies": sorted(expected_policies),
                    }

                global_rows = connection.execute(GLOBAL_COVERAGE_SQL).mappings().all()
                report["global"] = [_coverage_row(row) for row in global_rows]
                cohort_rows = connection.execute(COHORT_COVERAGE_SQL,
                    {"organizations": organizations}).mappings().all()
                by_organization: dict[uuid.UUID, list[dict]] = {
                    organization_id: [] for organization_id in organizations
                }
                for row in cohort_rows:
                    by_organization[row["organization_id"]].append(_coverage_row(row))
                for organization_id in organizations:
                    observed = {
                        resource["resource_type"]: resource
                        for resource in by_organization[organization_id]
                    }
                    unexpected = set(observed) - set(COHORT_RESOURCE_TYPES)
                    if unexpected:
                        raise RuntimeError(
                            "Unexpected catalogue cohort resource projection."
                        )
                    # Explicit zero rows prevent an empty tenant from looking
                    # identical to a report that accidentally omitted a stage.
                    resources = [observed.get(resource_type, {
                        "resource_type": resource_type,
                        "total": 0,
                        "missing": 0,
                        "blocked": 0,
                    }) for resource_type in COHORT_RESOURCE_TYPES]
                    missing = sum(item["missing"] for item in resources)
                    blocked = sum(item["blocked"] for item in resources)
                    report["organizations"].append({
                        "organization_id": str(organization_id),
                        "resources": resources,
                        "status": "INCOMPLETE" if missing else
                            "BLOCKED" if blocked else "RECONCILED",
                    })
                transaction.rollback()
            except Exception:
                transaction.rollback()
                raise
    finally:
        engine.dispose()

    all_rows = report["global"] + [resource
        for organization in report["organizations"]
        for resource in organization["resources"]]
    missing = sum(row["missing"] for row in all_rows)
    blocked = sum(row["blocked"] for row in all_rows)
    report["summary"] = {"missing_current_evidence": missing,
        "blocked_current_documents": blocked}
    report["status"] = "INCOMPLETE" if missing else "BLOCKED" if blocked else "RECONCILED"
    if args.output is not None:
        with args.output.open("x", encoding="utf-8") as evidence:
            json.dump(report, evidence, indent=2)
            evidence.write("\n")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "RECONCILED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
