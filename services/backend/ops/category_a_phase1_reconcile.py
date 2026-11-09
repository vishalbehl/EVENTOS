"""Operator-only bounded reconciliation; never infer user grants or tenant kinds.

Authorship only during implementation. Do not execute before authorised migration
rehearsal. Environment is selected via the existing migrator configuration.
"""
import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from pathlib import Path
from sqlalchemy import create_engine, text

sys.path.insert(0, str(Path(__file__).parents[1]))
from app.config import settings
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.rbac.services.permission_catalogue import OPERATIONAL_ACTIONS


def audit_batch(connection, args, acting_organization_id, workspace_id, count, *, foundation_created=False):
    values = {"id": uuid.uuid4(), "organization_id": args.organization,
        "actor_user_id": args.actor, "actor_role": "SUPER_ADMIN", "impersonated_by": None,
        "resource_type": "organization", "resource_id": args.organization,
        "action_type": "ORGANIZATION_OWNERSHIP_RECONCILED", "old_state": None,
        "new_state": {"workspace_id": str(workspace_id), "events_backfilled": count,
            "foundation_created": foundation_created, "membership_grants_changed": False,
            "acting_organization_id": str(acting_organization_id), "target_organization_id": str(args.organization)},
        "change_diff": {"reason": args.approval_reference.strip()}, "correlation_id": args.run_id,
        "is_sensitive": True, "occurred_at": datetime.now(timezone.utc), "hash_version": 2}
    values["row_hash"] = compute_audit_hash(SimpleNamespace(**values), version=2)
    connection.execute(AuditLog.__table__.insert().values(**values))


def summary(connection, organization_id):
    return dict(connection.execute(text("""SELECT
      (SELECT count(*) FROM events.events WHERE organization_id=:org) AS events_total,
      (SELECT count(*) FROM events.events WHERE organization_id=:org AND operational_workspace_id IS NULL) AS events_unassigned,
      (SELECT count(*) FROM events.events e LEFT JOIN organizer_access.operational_workspaces w
        ON w.id=e.operational_workspace_id AND w.organization_id=e.organization_id
        WHERE e.organization_id=:org AND e.operational_workspace_id IS NOT NULL AND w.id IS NULL) AS events_foreign_workspace,
      (SELECT count(*) FROM organizer_access.organization_members WHERE organization_id=:org) AS memberships_total,
      (SELECT count(*) FROM organizer_access.organization_members m JOIN identity.users u ON u.id=m.user_id
        WHERE m.organization_id=:org AND m.org_role='owner' AND m.is_active AND m.accepted_at IS NOT NULL
          AND u.is_active AND u.deleted_at IS NULL) AS accepted_active_owners,
      (SELECT count(*) FROM identity.users u WHERE u.organization_id=:org AND u.is_active AND u.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM organizer_access.organization_members m WHERE m.organization_id=:org
          AND m.user_id=u.id AND m.is_active AND m.accepted_at IS NOT NULL)) AS users_without_accepted_membership,
      (SELECT count(*) FROM organizer_access.organization_members m WHERE m.organization_id=:org
        AND m.is_active AND m.accepted_at IS NOT NULL AND
          (m.user_id IS NULL OR m.org_role NOT IN ('owner','admin','member','billing_only','viewer','reviewer','billing')
           OR NOT EXISTS (SELECT 1 FROM identity.users u WHERE u.id=m.user_id AND u.deleted_at IS NULL))) AS invalid_accepted_memberships,
      (SELECT count(*) FROM access.user_event_assignments a JOIN events.events e ON e.id=a.event_id
        WHERE e.organization_id=:org AND (jsonb_typeof(a.permissions)<>'object'
          OR (SELECT count(*) FROM jsonb_each(CASE WHEN jsonb_typeof(a.permissions)='object' THEN a.permissions ELSE '{}'::jsonb END))>32
          OR EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(a.permissions)='object' THEN a.permissions ELSE '{}'::jsonb END) p
            WHERE NOT (p.key=ANY(:event_actions)) OR jsonb_typeof(p.value)<>'boolean'))) AS invalid_event_assignments,
      (SELECT count(*) FROM organizer_access.emc_client_relationships r JOIN platform.organizations emc ON emc.id=r.emc_organization_id
        JOIN platform.organizations client ON client.id=r.client_organization_id
        WHERE :org IN (r.emc_organization_id,r.client_organization_id)
          AND (emc.organization_kind<>'EMC' OR client.organization_kind<>'CLIENT')) AS relationship_kind_conflicts,
      (SELECT count(*) FROM (SELECT client_organization_id FROM organizer_access.emc_client_relationships
        WHERE status IN ('ACTIVE','SUSPENDED') AND :org IN (emc_organization_id,client_organization_id)
        GROUP BY client_organization_id HAVING count(*)>1) conflicts) AS duplicate_managing_relationships,
      (SELECT count(*) FROM platform.organizations WHERE id=:org AND
        (organization_kind NOT IN ('NORMAL','EMC','CLIENT') OR organization_kind IS NULL)) AS classification_conflicts,
      (SELECT count(*) FROM platform.organizations WHERE id=:org AND
        ((NOT is_active AND archived_at IS NULL AND suspended_at IS NULL)
          OR (archived_at IS NOT NULL AND (is_active OR suspended_at IS NOT NULL)))) AS legacy_lifecycle_conflicts,
      (SELECT count(*) FROM access.user_event_assignments a JOIN events.events e ON e.id=a.event_id
        WHERE e.organization_id=:org AND NOT EXISTS (SELECT 1 FROM organizer_access.organization_members m
          WHERE m.organization_id=:org AND m.user_id=a.user_id AND m.is_active AND m.accepted_at IS NOT NULL)) AS unexplained_event_assignments,
      (SELECT count(*) FROM organizer_access.emc_client_relationships r
        WHERE :org IN (r.emc_organization_id,r.client_organization_id) AND r.status IN ('ACTIVE','SUSPENDED')
          AND (r.approved_at IS NULL OR r.approved_by IS NULL)) AS missing_relationship_consent
      """), {"org": organization_id, "event_actions": sorted(OPERATIONAL_ACTIONS)}).mappings().one())


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--organization", required=True, type=uuid.UUID)
    parser.add_argument("--actor", required=True, type=uuid.UUID, help="Approved active platform operator recorded in the audit trail")
    parser.add_argument("--confirmed-kind", required=True, choices=("NORMAL", "EMC", "CLIENT"))
    parser.add_argument("--approval-reference", required=True)
    parser.add_argument("--apply-ownership-backfill", action="store_true")
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args(argv)
    args.run_id = uuid.uuid4()
    if not 1 <= args.batch_size <= 1000 or not 12 <= len(args.approval_reference.strip()) <= 200:
        parser.error("Use a 1-1000 batch size and a 12-200 character approval reference.")
    migration_url = os.environ.get("MIGRATION_DATABASE_URL_SYNC", "")
    if not migration_url:
        parser.error("A dedicated MIGRATION_DATABASE_URL_SYNC operator environment is required.")
    engine = create_engine(migration_url, pool_size=1, max_overflow=0, pool_pre_ping=True)
    try:
        with engine.begin() as connection:
            actor = connection.execute(text("""SELECT u.organization_id FROM identity.users u
                JOIN platform.organizations o ON o.id=u.organization_id WHERE u.id=:actor
                AND u.is_active AND u.deleted_at IS NULL AND u.platform_role='SUPER_ADMIN'
                AND o.is_platform_org AND o.is_active AND o.suspended_at IS NULL"""),
                {"actor": args.actor}).mappings().one_or_none()
            if actor is None:
                raise RuntimeError("Approved active platform operator not found.")
            connection.execute(text("SELECT set_config('app.current_organization_id', :org, true)"), {"org": str(args.organization)})
            organization = connection.execute(text("SELECT id,organization_kind,is_platform_org FROM platform.organizations WHERE id=:org FOR UPDATE"),
                {"org": args.organization}).mappings().one_or_none()
            if organization is None or organization["is_platform_org"] or organization["organization_kind"] != args.confirmed_kind:
                raise RuntimeError("Selected customer organisation/kind requires explicit reconciliation; no inferred conversion is allowed.")
            before = summary(connection, args.organization)
            if args.apply_ownership_backfill:
                access_conflicts = sum(before[name] for name in (
                    "events_foreign_workspace", "invalid_accepted_memberships", "users_without_accepted_membership",
                    "relationship_kind_conflicts", "duplicate_managing_relationships", "invalid_event_assignments",
                    "classification_conflicts", "legacy_lifecycle_conflicts", "unexplained_event_assignments", "missing_relationship_consent")) + int(before["accepted_active_owners"] == 0)
                if access_conflicts:
                    print(json.dumps({"organization_id": str(args.organization), "status": "QUARANTINED",
                        "approval_reference": args.approval_reference.strip(), "applied": False,
                        "before": before, "membership_grants_changed": False}))
                    return 2
                workspace = connection.execute(text("SELECT id,status FROM organizer_access.operational_workspaces WHERE organization_id=:org AND is_default"),
                    {"org": args.organization}).mappings().one_or_none()
                if workspace is not None and workspace["status"] != "ACTIVE":
                    raise RuntimeError("Default workspace is archived; reconcile explicitly before backfill.")
                workspace_id = workspace["id"] if workspace else uuid.uuid4()
                if workspace is None:
                    connection.execute(text("""INSERT INTO organizer_access.operational_workspaces
                        (id,organization_id,name,is_default) VALUES (:id,:org,'Operations',true)"""),
                        {"id": workspace_id, "org": args.organization})
                connection.execute(text("""INSERT INTO organizer_access.organization_access_revisions (organization_id)
                    VALUES (:org) ON CONFLICT (organization_id) DO NOTHING"""), {"org": args.organization})
                if workspace is None:
                    audit_batch(connection, args, actor["organization_id"], workspace_id, 0, foundation_created=True)
        migrated = 0
        if args.apply_ownership_backfill:
            while True:
                with engine.begin() as connection:
                    connection.execute(text("SELECT set_config('app.current_organization_id', :org, true)"), {"org": str(args.organization)})
                    if connection.execute(text("""SELECT u.id FROM identity.users u JOIN platform.organizations o ON o.id=u.organization_id
                        WHERE u.id=:actor AND u.is_active AND u.deleted_at IS NULL AND u.platform_role='SUPER_ADMIN'
                        AND o.is_platform_org AND o.is_active AND o.suspended_at IS NULL"""), {"actor": args.actor}).scalar_one_or_none() is None:
                        raise RuntimeError("Operator authority was revoked; completed batches remain committed.")
                    # Shared access services lock revision before event rows too.
                    connection.execute(text("SELECT revision FROM organizer_access.organization_access_revisions WHERE organization_id=:org FOR UPDATE"), {"org": args.organization})
                    active_workspace = connection.execute(text("""SELECT id FROM organizer_access.operational_workspaces
                        WHERE id=:workspace AND organization_id=:org AND status='ACTIVE' AND is_default FOR SHARE"""),
                        {"org": args.organization, "workspace": workspace_id}).scalar_one_or_none()
                    if active_workspace is None:
                        raise RuntimeError("Default workspace changed during reconciliation; completed batches remain committed.")
                    result = connection.execute(text("""WITH batch AS (
                        SELECT id FROM events.events WHERE organization_id=:org AND operational_workspace_id IS NULL
                        ORDER BY id LIMIT :limit FOR UPDATE)
                        UPDATE events.events e SET operational_workspace_id=:workspace, version=version+1
                        FROM batch b WHERE e.id=b.id AND e.organization_id=:org AND e.operational_workspace_id IS NULL"""),
                        {"org": args.organization, "workspace": workspace_id, "limit": args.batch_size})
                    changed = int(result.rowcount or 0)
                    if changed:
                        connection.execute(text("UPDATE organizer_access.organization_access_revisions SET revision=revision+1 WHERE organization_id=:org"), {"org": args.organization})
                        audit_batch(connection, args, actor["organization_id"], workspace_id, changed)
                migrated += changed
                if changed == 0:
                    break
        with engine.begin() as connection:
            connection.execute(text("SELECT set_config('app.current_organization_id', :org, true)"), {"org": str(args.organization)})
            after = summary(connection, args.organization)
        blocking = sum(after[name] for name in ("events_unassigned", "events_foreign_workspace", "invalid_accepted_memberships",
            "relationship_kind_conflicts", "duplicate_managing_relationships", "users_without_accepted_membership",
            "invalid_event_assignments", "classification_conflicts", "legacy_lifecycle_conflicts",
            "unexplained_event_assignments", "missing_relationship_consent")) + int(after["accepted_active_owners"] == 0)
        print(json.dumps({"organization_id": str(args.organization), "confirmed_kind": args.confirmed_kind,
            "approval_reference": args.approval_reference.strip(), "applied": args.apply_ownership_backfill,
            "migrated_this_run": migrated, "before": before, "after": after,
            "correlation_id": str(args.run_id),
            "status": "QUARANTINED" if blocking else "RECONCILED_SOURCE_OWNERSHIP",
            "membership_grants_changed": False, "constraints_validated": False}))
        return 2 if blocking else 0
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
