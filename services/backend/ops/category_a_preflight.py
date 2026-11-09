"""Read-only inspection of the configured runtime role, migration and Redis primary."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from redis import Redis
from app.config import settings
from app.modules.billing.capability_registry import unknown_active_feature_keys

TABLES = ("operational_workspaces", "workspace_role_bindings", "emc_client_relationships", "emc_client_delegations", "emc_client_provisioning", "organization_access_revisions", "access_mutations", "organization_members", "organization_teams", "organization_team_members", "organization_team_events")
TEAM_CHECKS = ("ck_team_event_authorization_version", "ck_team_event_approved_permissions")
from app.core.ownership_constraints import OWNERSHIP_CONSTRAINTS
from ops.category_a_catalogue_policy_metadata import SHARED_CATALOGUE_QUERY, shared_catalogue_structure_is_safe

ROOT = Path(__file__).parents[1]


_DISCOVERY_QUERY = text("""
    SELECT p.prosecdef AS security_definer, p.proconfig AS fixed_settings,
           p.prorettype='uuid'::regtype AS uuid_result, p.proretset AS returns_set,
           p.prorettype='record'::regtype AS record_result, p.proargnames AS argument_names,
           p.provolatile='s' AS stable,
           owner.rolsuper OR owner.rolbypassrls AS definer_can_bypass_rls,
           pg_has_role(current_user,p.proowner,'MEMBER') AS runtime_can_assume_definer,
           has_schema_privilege(current_user,:schema_name,'CREATE') AS runtime_can_create_schema_objects,
           has_function_privilege(current_user,p.oid,'EXECUTE') AS runtime_can_execute,
           EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
                   WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_can_execute
      FROM pg_proc p JOIN pg_roles owner ON owner.oid=p.proowner
     WHERE p.oid=to_regprocedure(:signature)
""")
PUBLIC_DISCOVERY_QUERY = _DISCOVERY_QUERY.bindparams(schema_name="registration",
    signature="registration.public_form_owner_v1(uuid)")
REFERENCE_DISCOVERY_QUERY = _DISCOVERY_QUERY.bindparams(schema_name="design",
    signature="design.catalogue_reference_owners_v1(text,uuid,uuid,uuid)")
BLOCKED_REVIEW_QUERY = _DISCOVERY_QUERY.bindparams(schema_name="design",
    signature="design.catalogue_blocked_review_v1(text,uuid,timestamptz,uuid,integer)")
TEMPLATE_REVIEW_QUERY = _DISCOVERY_QUERY.bindparams(schema_name="design",
    signature="design.catalogue_template_review_v1(uuid,uuid,timestamptz,uuid,integer)")


def public_discovery_is_safe(row) -> bool:
    return _discovery_is_safe(row, returns_set=False)


def reference_discovery_is_safe(row) -> bool:
    return _discovery_is_safe(row, returns_set=True)


def blocked_review_is_safe(row) -> bool:
    return bool(_discovery_is_safe(row, returns_set=True, record=True)
        and list(row["argument_names"] or ()) == ["requested_type", "actor_id", "after_at", "after_id", "requested_limit",
            "reconciliation_id", "organization_id", "event_id", "resource_type", "resource_id",
            "resource_version", "reason", "created_at", "current_document"])


def template_review_is_safe(row) -> bool:
    return bool(_discovery_is_safe(row, returns_set=True, record=True)
        and list(row["argument_names"] or ()) == ["actor_id", "requested_template", "after_at", "after_id", "requested_limit",
            "reconciliation_id", "template_id", "organization_id", "template_name", "template_version", "reason", "created_at"])


def _discovery_is_safe(row, *, returns_set, record=False) -> bool:
    return bool(row and row["security_definer"] and row["record_result" if record else "uuid_result"] and row["stable"]
        and row["returns_set"] is returns_set
        and row["definer_can_bypass_rls"] and row["runtime_can_execute"]
        and not row["runtime_can_assume_definer"] and not row["public_can_execute"]
        and not row["runtime_can_create_schema_objects"]
        and set(row["fixed_settings"] or ()) == {"search_path=pg_catalog", "row_security=off"})


def inspect() -> dict:
    result = {"environment": settings.environment, "failures": [],
              "inspection_scope": "runtime_privileges_schema_and_catalogue_readiness",
              "whole_database_reconciliation": "NOT_CHECKED"}
    # SYNC may identify a migrator. Inspect the actual async API runtime
    # credentials using a sync driver without exposing its connection URL.
    runtime_url = make_url(settings.async_database_url).set(drivername="postgresql+psycopg2")
    migration_connection = os.environ.get("MIGRATION_DATABASE_URL_SYNC", "")
    if not settings.DATABASE_URL_ASYNC:
        result["failures"].append("Explicit async runtime credentials are missing")
    if not migration_connection:
        result["failures"].append("Separate operator migration credentials are required for deployment preflight")
    else:
        migrator_url = make_url(migration_connection)
        if runtime_url.username == migrator_url.username:
            result["failures"].append("API and migration credentials use the same database identity")
        if (runtime_url.host, runtime_url.port, runtime_url.database) != (migrator_url.host, migrator_url.port, migrator_url.database):
            result["failures"].append("Runtime and migration connections do not identify the same deployment database")
    engine = create_engine(runtime_url)
    try:
        with engine.connect() as connection:
            role = connection.execute(text("SELECT current_user AS name, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication FROM pg_roles WHERE rolname = current_user")).mappings().one()
            result["database_role"] = dict(role)
            discovery = connection.execute(PUBLIC_DISCOVERY_QUERY).mappings().one_or_none()
            result["public_form_discovery"] = dict(discovery) if discovery else None
            if not public_discovery_is_safe(discovery):
                result["failures"].append("Public form discovery function is missing or has unsafe ownership/settings/execute grants")
            references = connection.execute(REFERENCE_DISCOVERY_QUERY).mappings().one_or_none()
            result["catalogue_reference_discovery"] = dict(references) if references else None
            if not reference_discovery_is_safe(references):
                result["failures"].append("Catalogue reference discovery is missing or has unsafe ownership/settings/execute grants")
            review = connection.execute(BLOCKED_REVIEW_QUERY).mappings().one_or_none()
            result["catalogue_blocked_review"] = dict(review) if review else None
            if not blocked_review_is_safe(review):
                result["failures"].append("Catalogue review projection is missing or has unsafe metadata/ownership/settings/execute grants")
            template_review = connection.execute(TEMPLATE_REVIEW_QUERY).mappings().one_or_none()
            result["catalogue_template_review"] = dict(template_review) if template_review else None
            if not template_review_is_safe(template_review):
                result["failures"].append("Source-template review projection is missing or has unsafe metadata/ownership/settings/execute grants")
            if role["rolsuper"] or role["rolbypassrls"]:
                result["failures"].append("Configured runtime role bypasses row-level security")
            if role["rolcreatedb"] or role["rolcreaterole"] or role["rolreplication"]:
                result["failures"].append("Runtime identity has database/role creation or replication authority")
            inherited = connection.execute(text("""
                SELECT r.rolname FROM pg_roles r WHERE r.rolname <> current_user
                  AND (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)
                  AND pg_has_role(current_user, r.oid, 'MEMBER')
            """)).scalars().all()
            result["privileged_role_memberships"] = inherited
            if inherited:
                result["failures"].append("Runtime can assume a privileged database role")
            result["foundation_schema_create"] = connection.execute(text(
                "SELECT has_schema_privilege(current_user, 'organizer_access', 'CREATE')"
            )).scalar_one()
            if result["foundation_schema_create"]:
                result["failures"].append("Runtime can create objects in the access-control schema")
            required_runtime_schemas = ("public", "platform", "identity", "events", "registration",
                                        "organizer_access", "design", "abstract")
            schema_usage = {schema_name: bool(connection.execute(text(
                "SELECT has_schema_privilege(current_user, :schema_name, 'USAGE')"
            ), {"schema_name": schema_name}).scalar_one())
                for schema_name in required_runtime_schemas}
            result["required_schema_usage"] = schema_usage
            for schema_name, allowed in schema_usage.items():
                if not allowed:
                    result["failures"].append(
                        f"Runtime lacks USAGE on required schema: {schema_name}")
            rate_revision_table = connection.execute(text("""
                SELECT c.relrowsecurity, c.relforcerowsecurity,
                  pg_has_role(current_user, c.relowner, 'MEMBER') AS runtime_owns_table,
                  has_table_privilege(current_user, c.oid, 'SELECT') AS can_read,
                  has_table_privilege(current_user, c.oid, 'UPDATE') AS can_update,
                  has_table_privilege(current_user, c.oid, 'INSERT') AS can_insert,
                  has_table_privilege(current_user, c.oid, 'DELETE') AS can_delete,
                  has_table_privilege(current_user, c.oid, 'TRUNCATE') AS can_truncate
                FROM pg_class c WHERE c.oid = to_regclass('developer.rate_policy_revision')
            """)).mappings().one_or_none()
            result["rate_policy_revision_privileges"] = dict(rate_revision_table) if rate_revision_table else None
            if rate_revision_table is None or not rate_revision_table["can_read"] or not rate_revision_table["relrowsecurity"] or not rate_revision_table["relforcerowsecurity"] or any(rate_revision_table[name] for name in ("runtime_owns_table", "can_update", "can_insert", "can_delete", "can_truncate")):
                result["failures"].append("Rate policy epoch requires read-only non-owner runtime privileges and forced RLS")
            result["migration_revision"] = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            result["development_bootstrap_enabled"] = settings.ENABLE_DEVELOPMENT_BOOTSTRAP
            if settings.ENABLE_DEVELOPMENT_BOOTSTRAP:
                result["failures"].append("Release runtime must not enable development default seeding")
            result["unknown_active_catalogue_keys"] = unknown_active_feature_keys(
                connection.execute(text("SELECT key FROM commerce.feature_catalog WHERE is_active")).scalars().all())
            if result["unknown_active_catalogue_keys"]:
                result["failures"].append("Active catalogue keys lack registered enforcement; explicit reconciliation required")
            catalogue_ledgers = connection.execute(text("""
                SELECT to_regclass('design.form_template_reconciliations')::text AS template_ledger,
                       to_regclass('design.form_category_reconciliations')::text AS category_ledger,
                       to_regclass('design.catalogue_document_reconciliations')::text AS aggregate_ledger,
                       to_regclass('design.catalogue_reconciliation_runs')::text AS dispatch_ledger
            """)).mappings().one()
            result["catalogue_reconciliation_ledgers"] = dict(catalogue_ledgers)
            if any(not catalogue_ledgers[key] for key in
                    ("template_ledger", "category_ledger", "aggregate_ledger", "dispatch_ledger")):
                result["failures"].append("Catalogue reconciliation ledgers are missing")
            immutable_ledgers = {}
            for table_name in ("form_template_reconciliations",
                               "form_category_reconciliations",
                               "catalogue_document_reconciliations"):
                privileges = connection.execute(text("""
                    SELECT c.relrowsecurity, c.relforcerowsecurity,
                           coalesce(array_agg(p.polname) FILTER (WHERE p.polname IS NOT NULL),
                                    ARRAY[]::name[]) AS policies,
                           pg_has_role(current_user,c.relowner,'MEMBER') AS runtime_owns_table,
                           has_table_privilege(current_user,c.oid,'SELECT') AS can_read,
                           has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
                           has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
                           has_table_privilege(current_user,c.oid,'DELETE') AS can_delete,
                           has_table_privilege(current_user,c.oid,'TRUNCATE') AS can_truncate,
                           has_table_privilege(current_user,c.oid,'TRIGGER') AS can_trigger
                      FROM pg_class c
                      LEFT JOIN pg_policy p ON p.polrelid=c.oid
                     WHERE c.oid=to_regclass(:qualified_table)
                     GROUP BY c.oid
                """), {"qualified_table": f"design.{table_name}"}).mappings().one_or_none()
                immutable_ledgers[table_name] = dict(privileges) if privileges else None
                expected_policies = {
                    f"category_a_{table_name}_read",
                    f"category_a_{table_name}_append",
                }
                if privileges is None or not privileges["can_read"] or not privileges["can_insert"] \
                        or not privileges["relrowsecurity"] or not privileges["relforcerowsecurity"] \
                        or set(privileges["policies"] or ()) != expected_policies or any(
                        privileges[key] for key in ("runtime_owns_table", "can_update", "can_delete",
                                                    "can_truncate", "can_trigger")):
                    result["failures"].append(
                        f"{table_name} requires forced scoped RLS and append-only non-owner runtime privileges")
            result["catalogue_ledger_privileges"] = immutable_ledgers
            shared_catalogue = [dict(row) for row in connection.execute(SHARED_CATALOGUE_QUERY).mappings().all()]
            result["shared_catalogue_rls"] = shared_catalogue
            if not shared_catalogue_structure_is_safe(shared_catalogue):
                result["failures"].append("Shared catalogues require forced scoped RLS, owner guards and a non-owner runtime role")
            dispatch_privileges = connection.execute(text("""
                SELECT c.relrowsecurity, c.relforcerowsecurity,
                       coalesce(array_agg(p.polname) FILTER (WHERE p.polname IS NOT NULL),
                                ARRAY[]::name[]) AS policies,
                       pg_has_role(current_user,c.relowner,'MEMBER') AS runtime_owns_table,
                       has_table_privilege(current_user,c.oid,'SELECT') AS can_read,
                       has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
                       has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
                       has_table_privilege(current_user,c.oid,'DELETE') AS can_delete,
                       has_table_privilege(current_user,c.oid,'TRUNCATE') AS can_truncate,
                       has_table_privilege(current_user,c.oid,'TRIGGER') AS can_trigger
                  FROM pg_class c
                  LEFT JOIN pg_policy p ON p.polrelid=c.oid
                 WHERE c.oid=to_regclass('design.catalogue_reconciliation_runs')
                 GROUP BY c.oid
            """)).mappings().one_or_none()
            result["catalogue_dispatch_privileges"] = dict(dispatch_privileges) if dispatch_privileges else None
            if dispatch_privileges is None or not dispatch_privileges["relrowsecurity"] \
                    or not dispatch_privileges["relforcerowsecurity"] \
                    or set(dispatch_privileges["policies"] or ()) != {
                        "category_a_catalogue_reconciliation_runs_tenant"} \
                    or not all(dispatch_privileges[key] for key in
                    ("can_read", "can_insert", "can_update")) or any(dispatch_privileges[key] for key in
                    ("runtime_owns_table", "can_delete", "can_truncate", "can_trigger")):
                result["failures"].append(
                    "Catalogue dispatch ledger requires forced tenant RLS and non-owner SELECT/INSERT/UPDATE-only privileges")
            dispatch_checks = connection.execute(text("""
                SELECT conname, convalidated
                  FROM pg_constraint
                 WHERE conrelid=to_regclass('design.catalogue_reconciliation_runs')
                   AND conname=ANY(:names)
            """), {"names": ["ck_catalogue_reconciliation_run_status",
                                "ck_catalogue_reconciliation_run_dispatch_attempts"]}).mappings().all()
            result["catalogue_dispatch_checks"] = [dict(row) for row in dispatch_checks]
            if {row["conname"] for row in dispatch_checks if row["convalidated"]} != {
                    "ck_catalogue_reconciliation_run_status",
                    "ck_catalogue_reconciliation_run_dispatch_attempts"}:
                result["failures"].append("Catalogue dispatch constraints are missing or unvalidated")
            catalogue_indexes = connection.execute(text("""
                SELECT c.relname, i.indisvalid, i.indisready, i.indisunique,
                       pg_get_expr(i.indpred, i.indrelid) AS predicate
                  FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
                 WHERE c.relname = ANY(:names)
            """), {"names": [
                "uq_design_global_form_categories_slug_active",
                "uq_design_owned_form_categories_slug_active",
                "uq_design_global_form_templates_slug_active",
                "uq_design_owned_form_templates_slug_active",
            ]}).mappings().all()
            result["catalogue_uniqueness_indexes"] = [dict(row) for row in catalogue_indexes]
            if len(catalogue_indexes) != 4 or any(not row["indisvalid"] or not row["indisready"]
                    or not row["indisunique"] or not row["predicate"] for row in catalogue_indexes):
                result["failures"].append("Catalogue owner/slug uniqueness indexes are incomplete")
            expected_hot_path_indexes = {
                ("design", "ix_design_global_form_categories_page_active"),
                ("design", "ix_design_owned_form_categories_page_active"),
                ("content", "ix_content_durable_upload_recovery_active"),
                ("platform", "ix_usage_reservation_upload_id_active"),
                ("platform", "ix_program_dispatch_due"),
                ("platform", "ix_registration_upload_dispatch_due"),
                ("registration", "ix_registration_participants_event_normalized_identity"),
                ("registration", "ix_registration_participants_event_lower_email"),
                ("registration", "ix_registration_participants_additional_emails"),
            }
            hot_path_indexes = connection.execute(text("""
                SELECT namespace.nspname AS schema_name, index_class.relname,
                       index_state.indisvalid, index_state.indisready,
                       pg_get_expr(index_state.indpred, index_state.indrelid) AS predicate
                  FROM pg_index index_state
                  JOIN pg_class index_class ON index_class.oid=index_state.indexrelid
                  JOIN pg_namespace namespace ON namespace.oid=index_class.relnamespace
                 WHERE index_class.relname=ANY(:names)
                   AND namespace.nspname=ANY(:schemas)
            """), {
                "names": [name for _, name in expected_hot_path_indexes],
                "schemas": list({schema for schema, _ in expected_hot_path_indexes}),
            }).mappings().all()
            result["category_a_hot_path_indexes"] = [dict(row) for row in hot_path_indexes]
            actual_hot_path_indexes = {
                (row["schema_name"], row["relname"]) for row in hot_path_indexes
            }
            if actual_hot_path_indexes != expected_hot_path_indexes or any(
                    not row["indisvalid"] or not row["indisready"] or not row["predicate"]
                    for row in hot_path_indexes):
                result["failures"].append(
                    "Category paging, public identity, or upload recovery indexes are incomplete"
                )
            context_columns = connection.execute(text("""
                SELECT attname, attnotnull
                  FROM pg_attribute
                 WHERE attrelid = to_regclass('identity.refresh_tokens')
                   AND attname = ANY(:names) AND NOT attisdropped
            """), {"names": ["access_mode", "active_organization_id", "acting_organization_id",
                "active_workspace_id", "active_event_id", "relationship_id"]}).mappings().all()
            result["session_context_columns"] = [dict(row) for row in context_columns]
            context_by_name = {row["attname"]: row for row in context_columns}
            if set(context_by_name) != {"access_mode", "active_organization_id", "acting_organization_id",
                                       "active_workspace_id", "active_event_id", "relationship_id"}:
                result["failures"].append("Session access-context migration is incomplete")
            elif not all(context_by_name[name]["attnotnull"] for name in (
                    "access_mode", "active_organization_id", "acting_organization_id")):
                result["failures"].append("Session access-context identity columns must be non-null")
            context_checks = connection.execute(text("""
                SELECT conname, convalidated
                  FROM pg_constraint
                 WHERE conrelid = to_regclass('identity.refresh_tokens')
                   AND conname = ANY(:names)
            """), {"names": ["ck_refresh_token_access_mode", "ck_refresh_token_context_shape"]}).mappings().all()
            result["session_context_checks"] = [dict(row) for row in context_checks]
            if {row["conname"] for row in context_checks if row["convalidated"]} != {
                    "ck_refresh_token_access_mode", "ck_refresh_token_context_shape"}:
                result["failures"].append("Session access-context constraints are missing or unvalidated")
            discovery_policies = connection.execute(text("""
                SELECT tablename, policyname, cmd
                  FROM pg_policies
                 WHERE schemaname = 'organizer_access'
                   AND policyname = ANY(:names)
            """), {"names": ["delegation_discovery_identity", "relationship_discovery_identity",
                "delegated_workspace_discovery_identity"]}).mappings().all()
            result["delegated_context_discovery_policies"] = [dict(row) for row in discovery_policies]
            if {row["policyname"] for row in discovery_policies if row["cmd"] == "SELECT"} != {
                    "delegation_discovery_identity", "relationship_discovery_identity",
                    "delegated_workspace_discovery_identity"}:
                result["failures"].append("Identity-bound delegated context discovery policies are incomplete")
            dispatch_columns = connection.execute(text("""SELECT attname,attnotnull
                FROM pg_attribute WHERE attrelid=to_regclass('operations.organization_lifecycle_jobs')
                AND attname IN ('dispatch_attempts','next_dispatch_at') AND NOT attisdropped""")).mappings().all()
            result["lifecycle_dispatch_columns"] = [dict(row) for row in dispatch_columns]
            if len(dispatch_columns) != 2 or not any(row["attname"] == "dispatch_attempts" and row["attnotnull"] for row in dispatch_columns):
                result["failures"].append("Durable lifecycle dispatch migration is missing")
            dispatch_index = connection.execute(text("""SELECT i.indisvalid,i.indisready,
                pg_get_expr(i.indpred,i.indrelid) AS predicate FROM pg_index i
                WHERE i.indexrelid=to_regclass('operations.ix_lifecycle_dispatch_due')""")).mappings().one_or_none()
            result["lifecycle_dispatch_index"] = dict(dispatch_index) if dispatch_index else None
            if dispatch_index is None or not dispatch_index["indisvalid"] or not dispatch_index["indisready"] or not dispatch_index["predicate"]:
                result["failures"].append("Durable lifecycle dispatch index is missing or invalid")
            snapshot = connection.execute(text("""
                SELECT c.relrowsecurity, c.relforcerowsecurity,
                  pg_has_role(current_user,c.relowner,'MEMBER') AS runtime_owns_table,
                  has_table_privilege(current_user,c.oid,'SELECT') AS can_read,
                  has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
                  has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
                  has_table_privilege(current_user,c.oid,'DELETE') AS can_delete,
                  has_table_privilege(current_user,c.oid,'TRUNCATE') AS can_truncate,
                  has_table_privilege(current_user,c.oid,'TRIGGER') AS can_trigger
                FROM pg_class c WHERE c.oid=to_regclass('communications.campaign_recipient_snapshots')
            """)).mappings().one_or_none()
            result["campaign_snapshot_privileges"] = dict(snapshot) if snapshot else None
            if snapshot is None or not snapshot["can_read"] or not snapshot["can_insert"] or not snapshot["relrowsecurity"] or not snapshot["relforcerowsecurity"] or any(snapshot[key] for key in (
                "runtime_owns_table", "can_update", "can_delete", "can_truncate", "can_trigger")):
                result["failures"].append("Campaign snapshots require forced RLS and non-owner SELECT/INSERT-only runtime privileges")
            for table_name in ("campaign_attempts", "campaign_attempt_outcomes"):
                history = connection.execute(text("""
                    SELECT c.relrowsecurity, c.relforcerowsecurity,
                      pg_has_role(current_user,c.relowner,'MEMBER') AS runtime_owns_table,
                      has_table_privilege(current_user,c.oid,'SELECT') AS can_read,
                      has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
                      has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
                      has_table_privilege(current_user,c.oid,'DELETE') AS can_delete,
                      has_table_privilege(current_user,c.oid,'TRUNCATE') AS can_truncate,
                      has_table_privilege(current_user,c.oid,'TRIGGER') AS can_trigger
                    FROM pg_class c WHERE c.oid=to_regclass(:qualified_table)
                """), {"qualified_table": f"communications.{table_name}"}).mappings().one_or_none()
                result[f"{table_name}_privileges"] = dict(history) if history else None
                if history is None or not history["can_read"] or not history["can_insert"] or not history["relrowsecurity"] or not history["relforcerowsecurity"] or any(history[key] for key in (
                    "runtime_owns_table", "can_update", "can_delete", "can_truncate", "can_trigger")):
                    result["failures"].append(f"{table_name} requires forced RLS and SELECT/INSERT-only non-owner runtime privileges")
            policies = connection.execute(text("""
                SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                       pg_has_role(current_user, c.relowner, 'MEMBER') AS runtime_owns_table
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'organizer_access' AND c.relname = ANY(:tables)
            """), {"tables": list(TABLES)}).mappings().all()
            result["foundation_tables"] = [dict(row) for row in policies]
            if len(policies) != len(TABLES):
                result["failures"].append("Foundation tables missing")
            for row in policies:
                if not row["relrowsecurity"] or not row["relforcerowsecurity"] or row["runtime_owns_table"]:
                    result["failures"].append(f"Unsafe RLS/runtime ownership: {row['relname']}")
            fences = connection.execute(text("""
                SELECT tablename, policyname, permissive, cmd, roles, qual, with_check
                FROM pg_policies WHERE schemaname = 'organizer_access'
                  AND tablename = ANY(:tables)
            """), {"tables": ["organization_teams", "organization_team_members", "organization_team_events"]}).mappings().all()
            result["team_tenant_policies"] = [dict(row) for row in fences]
            for table in ("organization_teams", "organization_team_members", "organization_team_events"):
                fence = next((row for row in fences if row["tablename"] == table
                              and row["policyname"] == f"category_a_fence_{table}"), None)
                if fence is None or fence["permissive"] != "RESTRICTIVE" or fence["cmd"] != "ALL" or list(fence["roles"]) != ["public"] or not fence["qual"] or not fence["with_check"]:
                    result["failures"].append(f"Missing restrictive team tenant fence: {table}")
            # Catalog presence is not a behavioural RLS acceptance result; the
            # separate runtime-role negative matrix remains a mandatory gate.
            # Never certify whole-database ownership through the runtime role:
            # a correct fail-closed RLS policy can hide every offending row.
            # The separate authorised migration-operator report covers that gate.
            team_checks = connection.execute(text("""
                SELECT c.conname, c.convalidated, c.contype
                FROM pg_constraint c
                WHERE c.conrelid = to_regclass('organizer_access.organization_team_events')
                  AND c.conname = ANY(:names)
            """), {"names": list(TEAM_CHECKS)}).mappings().all()
            result["reviewed_team_constraints"] = [dict(row) for row in team_checks]
            validated_team_checks = {row["conname"] for row in team_checks
                                     if row["contype"] == "c" and row["convalidated"] is True}
            for name in TEAM_CHECKS:
                if name not in validated_team_checks:
                    result["failures"].append(f"Missing/unvalidated reviewed-team check: {name}")
            marker = connection.execute(text("""
                SELECT a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS default_expression
                FROM pg_attribute a LEFT JOIN pg_attrdef d
                  ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                WHERE a.attrelid = to_regclass('organizer_access.organization_team_events')
                  AND a.attname = 'authorization_version' AND NOT a.attisdropped
            """)).mappings().one_or_none()
            result["reviewed_team_marker"] = dict(marker) if marker else None
            if marker is None or not marker["attnotnull"] or marker["default_expression"] != "0":
                result["failures"].append("Team bindings must default to unreviewed, non-null authority")
            ownership_rows = connection.execute(text("""
                SELECT n.nspname AS schema_name, t.relname AS table_name,
                       c.conname, c.convalidated, c.contype
                FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE c.conname = ANY(:names)
            """), {"names": [item[2] for item in OWNERSHIP_CONSTRAINTS]}).mappings().all()
            ownership = {(row["schema_name"], row["table_name"], row["conname"]): row
                         for row in ownership_rows}
            result["ownership_constraints"] = [dict(row) for row in ownership_rows]
            for required in OWNERSHIP_CONSTRAINTS:
                row = ownership.get(required)
                expected_type = "c" if required[2].startswith("ck_") else "f"
                if row is None or row["contype"] != expected_type or row["convalidated"] is not True:
                    result["failures"].append(f"Missing/unvalidated ownership constraint: {'.'.join(required)}")
            workspace_row = ownership.get(("events", "events", "fk_event_workspace_owner"))
            result["workspace_constraint_validated"] = workspace_row["convalidated"] if workspace_row else None
            if result["workspace_constraint_validated"] is not True:
                result["failures"].append("Composite event ownership constraint has not been validated")
    finally:
        engine.dispose()
    client = Redis.from_url(settings.redis_lock_url, socket_connect_timeout=5, socket_timeout=5)
    try:
        replication = client.info("replication")
        cluster = client.info("cluster")
        result["redis"] = {"role": replication.get("role"), "cluster_enabled": cluster.get("cluster_enabled")}
        if replication.get("role") != "master" or cluster.get("cluster_enabled") != 0:
            result["failures"].append("Rate limiter requires a writable, non-cluster Redis primary")
    finally:
        client.close()
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        help="Reserve a JSON evidence file under services/backend/test-results.",
    )
    args = parser.parse_args()
    result = inspect()
    if args.output:
        output = args.output.resolve()
        evidence_root = (ROOT / "test-results").resolve()
        if output.parent != evidence_root:
            parser.error("--output must be a direct child of services/backend/test-results")
        with output.open("x", encoding="utf-8") as evidence:
            json.dump(result, evidence, indent=2)
            evidence.write("\n")
    print(json.dumps(result, indent=2))
    raise SystemExit(1 if result["failures"] else 0)
