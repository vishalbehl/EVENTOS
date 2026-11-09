"""Remove remaining database objects that existed only for cloud pricing.

The 3100 cutover removed the legacy plan, subscription, add-on, and payment
tables.  This follow-up removes the last versioning and reverse-reference
columns that could otherwise make the retired catalogue appear supported.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260917_3120"
down_revision = "20260917_3110"
branch_labels = None
depends_on = None


def _has_column(connection: sa.Connection, table: str, column: str, schema: str) -> bool:
    return any(
        row[0] == column
        for row in connection.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = :schema AND table_name = :table"
            ),
            {"schema": schema, "table": table},
        )
    )


def _has_table(connection: sa.Connection, table: str, schema: str) -> bool:
    return bool(
        connection.execute(
            sa.text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = :schema AND table_name = :table"
            ),
            {"schema": schema, "table": table},
        ).first()
    )


def upgrade() -> None:
    connection = op.get_bind()

    # Preserve the audit meaning of old access requests in the canonical
    # request ledger before removing their plan/add-on-shaped table.  The old
    # plan UUID is intentionally recorded as historical metadata, never as a
    # new offer or price reference.
    if _has_table(connection, "commercial_access_requests", "business"):
        connection.execute(
            sa.text(
                """
                INSERT INTO commerce.commercial_accounts
                    (id, account_type, owner_organization_id, status, currency, country, version, created_at, updated_at)
                SELECT gen_random_uuid(), 'ORGANIZER', r.organization_id, 'ACTIVE', r.currency, 'IN', 1, now(), now()
                FROM business.commercial_access_requests r
                WHERE NOT EXISTS (
                    SELECT 1 FROM commerce.commercial_accounts a
                    WHERE a.owner_organization_id = r.organization_id
                )
                GROUP BY r.organization_id, r.currency
                """
            )
        )
        connection.execute(
            sa.text(
                """
                INSERT INTO commerce.commercial_account_workspaces
                    (id, commercial_account_id, organization_id, workspace_role, status, created_at, updated_at)
                SELECT gen_random_uuid(), a.id, a.owner_organization_id, 'OWNER', 'ACTIVE', now(), now()
                FROM commerce.commercial_accounts a
                WHERE NOT EXISTS (
                    SELECT 1 FROM commerce.commercial_account_workspaces w
                    WHERE w.commercial_account_id = a.id AND w.organization_id = a.owner_organization_id
                )
                """
            )
        )
        connection.execute(
            sa.text(
                """
                INSERT INTO commerce.commercial_requests
                    (id, commercial_account_id, organization_id, request_type, product_family,
                     event_id, requested_offer_codes, requested_capacity, requirements_json,
                     preview_snapshot_json, billing_profile, quote_id, quote_reference, status,
                     reason, created_by, decided_by, decided_at, decision_reason,
                     idempotency_key, version, created_at, updated_at)
                SELECT r.id, a.id, r.organization_id, 'MIGRATED_LEGACY_REQUEST', 'CUSTOM',
                       r.event_id,
                       jsonb_build_array('LEGACY_PLAN_' || r.requested_plan_id::text),
                       jsonb_build_object('legacy_addon_keys', r.requested_addon_keys),
                       jsonb_build_object('legacy_request_type', r.request_type,
                                          'legacy_case_reference', r.case_reference),
                       jsonb_build_object('legacy_quoted_amount', r.quoted_amount),
                       r.billing_profile, NULL, r.case_reference,
                       CASE WHEN r.status = 'APPLIED' THEN 'APPROVED' ELSE r.status END,
                       r.reason, r.requested_by, r.decided_by, r.decided_at,
                       r.decision_reason, 'legacy-migrated-' || r.id::text, r.version,
                       r.created_at, r.updated_at
                FROM business.commercial_access_requests r
                JOIN commerce.commercial_accounts a ON a.owner_organization_id = r.organization_id
                WHERE NOT EXISTS (SELECT 1 FROM commerce.commercial_requests n WHERE n.id = r.id)
                """
            )
        )
        op.drop_table("commercial_access_requests", schema="business")

    if _has_table(connection, "commercial_template_versions", "commerce"):
        op.drop_table("commercial_template_versions", schema="commerce")


def downgrade() -> None:
    raise RuntimeError("Legacy cloud pricing metadata removal is intentionally irreversible")
