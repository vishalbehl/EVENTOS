"""Index compatibility cursor projections without changing tenant authority."""
from alembic import op

revision = "20261007_3280"
down_revision = "20261007_3270"
branch_labels = None
depends_on = None


def upgrade():
    indexes = (
        ("ix_role_tenant_created_cursor", "user_roles", "organization_id, created_at DESC, id DESC", "deleted_at IS NULL AND organization_id IS NOT NULL"),
        ("ix_role_template_created_cursor", "user_roles", "created_at DESC, id DESC", "deleted_at IS NULL AND organization_id IS NULL AND is_system_role = true"),
        ("ix_org_assignment_created_cursor", "user_role_assignments", "organization_id, assigned_at DESC, id DESC", "revoked_at IS NULL AND event_id IS NULL"),
        ("ix_event_assignment_created_cursor", "user_role_assignments", "organization_id, assigned_at DESC, id DESC", "revoked_at IS NULL AND event_id IS NOT NULL"),
    )
    with op.get_context().autocommit_block():
        # Names and SQL expressions are compile-time constants, never inputs.
        for name, table, columns, predicate in indexes:
            op.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} ON organizer_access.{table} ({columns}) WHERE {predicate}")
        op.execute("""DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'organizer_access'
            AND c.relname IN ('ix_role_tenant_created_cursor', 'ix_role_template_created_cursor',
              'ix_org_assignment_created_cursor', 'ix_event_assignment_created_cursor')
            AND (NOT i.indisvalid OR NOT i.indisready)) THEN
            RAISE EXCEPTION 'Access cursor index requires operator-reviewed repair before retry';
          END IF;
        END $$""")


def downgrade():
    raise RuntimeError("Keep additive cursor indexes during application rollback.")
