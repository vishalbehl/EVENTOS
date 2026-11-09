"""Expiring digest-only invitations; preserve membership and accepted history."""
from alembic import op
import sqlalchemy as sa

revision = "20261006_3210"
down_revision = "20261006_3200"
branch_labels = None
depends_on = None


def upgrade():
    for name in ("invite_expires_at", "invite_consumed_at"):
        op.add_column("organization_members", sa.Column(name, sa.DateTime(timezone=True)), schema="organizer_access")
    op.add_column("organization_members", sa.Column("invite_token_digest", sa.String(64)), schema="organizer_access")
    # Bounded batches, parameter-free deterministic transformation. This is an
    # atomic migration; interruption rolls back and can safely be restarted.
    connection = op.get_bind()
    while connection.execute(sa.text("""
        UPDATE organizer_access.organization_members SET
            invite_token_digest = CASE WHEN accepted_at IS NULL THEN encode(sha256(convert_to(invite_token, 'UTF8')), 'hex') ELSE NULL END,
            invite_expires_at = CASE WHEN accepted_at IS NULL THEN invited_at + interval '7 days' ELSE NULL END,
            invite_consumed_at = accepted_at,
            invite_token = NULL
        WHERE id IN (SELECT id FROM organizer_access.organization_members WHERE invite_token IS NOT NULL LIMIT 1000)
    """)).rowcount:
        pass
    op.create_unique_constraint("uq_organization_member_invite_token_digest", "organization_members", ["invite_token_digest"], schema="organizer_access")
    # Retain the legacy column but disallow a rolling old writer from persisting
    # credentials in it. Older issuance routes fail closed, never silently leak.
    op.create_check_constraint("ck_membership_no_raw_invite_token", "organization_members", "invite_token IS NULL", schema="organizer_access")
    op.execute("ALTER TABLE organizer_access.organization_members ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organizer_access.organization_members FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY membership_tenant_scope ON organizer_access.organization_members
        USING (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid)
    """)
    op.execute("""
        CREATE POLICY membership_invitation_identity ON organizer_access.organization_members FOR SELECT
        USING (invite_token_digest = nullif(current_setting('app.invitation_token_digest', true), '')
            AND lower(invite_email) = nullif(current_setting('app.invitation_identity_email', true), '')
            AND is_active = true)
    """)


def downgrade():
    raise RuntimeError("Retain digest-only invitations; do not restore plaintext token storage.")
