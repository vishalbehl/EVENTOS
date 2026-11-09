"""Indexed subject/scope lookups for customer event visibility."""
from alembic import op

revision = "20261007_3240"
down_revision = "20261007_3230"
branch_labels = None
depends_on = None


def upgrade():
    with op.get_context().autocommit_block():
        op.create_index("ix_access_node_subject_scope", "user_access_nodes", ["user_id", "node_type", "node_id"],
                        schema="access", postgresql_concurrently=True)
        op.create_index("ix_role_assignment_subject_event", "user_role_assignments", ["user_id", "event_id", "organization_id"],
                        schema="organizer_access", postgresql_concurrently=True)


def downgrade():
    # Harmless additive indexes remain during application rollback. Do not
    # remove the new scope checks or revive the global-role tenant bypass.
    pass
