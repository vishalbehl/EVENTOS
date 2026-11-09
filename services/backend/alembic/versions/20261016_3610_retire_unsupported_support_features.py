"""Retire explicitly reviewed unsupported benefits; preserve commercial snapshots.

Revision ID: 20261016_3610
Revises: 20261016_3600
"""
from datetime import datetime, timezone
import hashlib
import json
import uuid

from alembic import op
from sqlalchemy import text

revision = "20261016_3610"
down_revision = "20261016_3600"
branch_labels = None
depends_on = None

RETIRED_KEYS = (
    "FEAT_EMAIL_SUPPORT", "FEAT_PRIORITY_SUPPORT",
    "FEAT_OFFICE_HOURS_SUPPORT", "FEAT_24x7_SUPPORT",
)


def retire_reviewed_features(connection):
    # Fixed four-key bound and deterministic locks; no plan/contract writes.
    rows = connection.execute(text("""SELECT id,key,is_active,lifecycle_status,version
        FROM commerce.feature_catalog WHERE key IN (:a,:b,:c,:d)
        ORDER BY key FOR UPDATE"""), dict(zip("abcd", RETIRED_KEYS))).mappings().all()
    changed = 0
    for row in rows:
        if not row["is_active"] and row["lifecycle_status"] == "RETIRED":
            continue
        at = datetime.now(timezone.utc)
        before = {key: row[key] for key in ("key", "is_active", "lifecycle_status", "version")}
        after = {**before, "is_active": False, "lifecycle_status": "RETIRED",
                 "version": (row["version"] or 0) + 1}
        diff = {"reason": "Owner approved retirement of unsupported legacy support features",
                "migration": revision, "commercial_snapshots": "unchanged"}
        payload = {"actor_role": "MIGRATION", "actor_user_id": None,
            "change_diff": diff, "impersonated_by": None, "is_sensitive": False,
            "new_state": after, "occurred_at": at.isoformat(), "old_state": before,
            "organization_id": None, "resource_id": str(row["id"]),
            "resource_type": "FEATURE_CATALOG", "action_type": "LEGACY_SUPPORT_FEATURE_RETIRED"}
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True,
            separators=(",", ":"), default=str).encode("utf-8")).hexdigest()
        connection.execute(text("""UPDATE commerce.feature_catalog
            SET is_active=false,lifecycle_status='RETIRED',version=:version,
                updated_at=:at WHERE id=:id"""),
            {"id": row["id"], "version": after["version"], "at": at})
        connection.execute(text("""INSERT INTO command_center_audit.logs
            (id,resource_type,resource_id,action_type,actor_role,old_state,new_state,
             change_diff,row_hash,hash_version,is_sensitive,occurred_at)
            VALUES (:audit_id,'FEATURE_CATALOG',:id,'LEGACY_SUPPORT_FEATURE_RETIRED',
             'MIGRATION',CAST(:before AS jsonb),CAST(:after AS jsonb),CAST(:diff AS jsonb),
             :digest,2,false,:at)"""),
            {"audit_id": uuid.uuid4(), "id": row["id"], "before": json.dumps(before),
             "after": json.dumps(after), "diff": json.dumps(diff), "digest": digest, "at": at})
        changed += 1
    return changed


def upgrade():
    retire_reviewed_features(op.get_bind())


def downgrade():
    # Application rollback must not resurrect unsupported operational grants.
    # Retain the reviewed retirement and its immutable audit evidence.
    pass
