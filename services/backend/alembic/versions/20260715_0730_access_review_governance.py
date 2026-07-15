"""Extend access reviews for dual-control privileged governance.

Revision ID: access_review_governance_0730
Revises: support_admin_lifecycle_0720
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "access_review_governance_0730"
down_revision = "support_admin_lifecycle_0720"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("access_reviews", "reviewer_id", existing_type=sa.UUID(), nullable=True, schema="audit")
    op.create_foreign_key("fk_access_reviews_reviewer", "access_reviews", "users", ["reviewer_id"], ["id"], source_schema="audit", referent_schema="identity", ondelete="SET NULL")
    columns = [
        sa.Column("organization_id", sa.UUID(), nullable=True),
        sa.Column("target_user_id", sa.UUID(), nullable=True),
        sa.Column("requested_by", sa.UUID(), nullable=True),
        sa.Column("review_type", sa.String(30), nullable=False, server_default="PERIODIC"),
        sa.Column("scope_json", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("request_reason", sa.Text(), nullable=True),
        sa.Column("decision_reason", sa.Text(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    ]
    for column in columns:
        op.add_column("access_reviews", column, schema="audit")
    op.create_foreign_key("fk_access_reviews_org", "access_reviews", "organizations", ["organization_id"], ["id"], source_schema="audit", referent_schema="platform", ondelete="CASCADE")
    op.create_foreign_key("fk_access_reviews_target", "access_reviews", "users", ["target_user_id"], ["id"], source_schema="audit", referent_schema="identity", ondelete="CASCADE")
    op.create_foreign_key("fk_access_reviews_requester", "access_reviews", "users", ["requested_by"], ["id"], source_schema="audit", referent_schema="identity", ondelete="SET NULL")
    op.create_index("ix_audit_access_reviews_org_status", "access_reviews", ["organization_id", "status", "created_at"], schema="audit")


def downgrade() -> None:
    op.drop_index("ix_audit_access_reviews_org_status", table_name="access_reviews", schema="audit")
    for constraint in ("fk_access_reviews_requester", "fk_access_reviews_target", "fk_access_reviews_org"):
        op.drop_constraint(constraint, "access_reviews", schema="audit", type_="foreignkey")
    for column in ("version", "decided_at", "due_at", "decision_reason", "request_reason", "scope_json", "review_type", "requested_by", "target_user_id", "organization_id"):
        op.drop_column("access_reviews", column, schema="audit")
    op.drop_constraint("fk_access_reviews_reviewer", "access_reviews", schema="audit", type_="foreignkey")
    op.alter_column("access_reviews", "reviewer_id", existing_type=sa.UUID(), nullable=False, schema="audit")
