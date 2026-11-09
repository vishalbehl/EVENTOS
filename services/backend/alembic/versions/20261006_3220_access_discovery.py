"""Accepted identity projection and indexed context discovery."""
from alembic import op
import sqlalchemy as sa

revision = "20261006_3220"
down_revision = "20261006_3210"
branch_labels = None
depends_on = None


def upgrade():
    with op.get_context().autocommit_block():
        op.create_index("ix_membership_context_page", "organization_members", ["user_id", "organization_id"],
                        schema="organizer_access", postgresql_where=sa.text("is_active = true AND accepted_at IS NOT NULL"),
                        postgresql_concurrently=True)
    op.execute("""
        CREATE POLICY membership_discovery_identity ON organizer_access.organization_members FOR SELECT
        USING (user_id = nullif(current_setting('app.access_discovery_user_id', true), '')::uuid
            AND is_active = true AND accepted_at IS NOT NULL)
    """)


def downgrade():
    # Narrow discovery can be removed without deleting membership history.
    op.execute("DROP POLICY membership_discovery_identity ON organizer_access.organization_members")
    # Retain the harmless additive index to keep application rollback nonblocking.
