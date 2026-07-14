"""Add revocable proposal sharing and client decision evidence."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "proposal_sharing_0630"
down_revision = "quote_proposals_0620"
branch_labels = None
depends_on = None

TENANT_POLICY = "organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid"


def upgrade() -> None:
    op.create_table(
        "proposal_shares",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("proposal_id", UUID(as_uuid=True), sa.ForeignKey("crm.proposals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("proposal_version", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("recipient_name", sa.String(200), nullable=False),
        sa.Column("recipient_email", sa.String(320), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="ACTIVE"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("revocation_reason", sa.String(500), nullable=True),
        sa.Column("revocation_idempotency_key", sa.String(128), nullable=True),
        sa.Column("revocation_request_hash", sa.String(64), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("access_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("decision", sa.String(30), nullable=True),
        sa.Column("decision_reason", sa.String(1000), nullable=True),
        sa.Column("signer_name", sa.String(200), nullable=True),
        sa.Column("signer_title", sa.String(200), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_idempotency_key", sa.String(128), nullable=True),
        sa.Column("decision_request_hash", sa.String(64), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.UniqueConstraint("organization_id", "proposal_id", "idempotency_key", name="uq_proposal_share_idempotency"),
        schema="crm",
    )
    op.create_index("ix_proposal_shares_org_proposal", "proposal_shares", ["organization_id", "proposal_id"], schema="crm")
    op.create_table(
        "proposal_share_accesses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("share_id", UUID(as_uuid=True), sa.ForeignKey("crm.proposal_shares.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="crm",
    )
    op.create_index("ix_proposal_share_access_org_share", "proposal_share_accesses", ["organization_id", "share_id"], schema="crm")
    for table in ("proposal_shares", "proposal_share_accesses"):
        op.execute(f"ALTER TABLE crm.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE crm.{table} FORCE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY tenant_isolation_{table} ON crm.{table} USING ({TENANT_POLICY}) WITH CHECK ({TENANT_POLICY})")


def downgrade() -> None:
    for table in ("proposal_share_accesses", "proposal_shares"):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON crm.{table}")
    op.drop_table("proposal_share_accesses", schema="crm")
    op.drop_table("proposal_shares", schema="crm")
