"""Additive role-graph uniqueness and lookup indexes. No legacy access is inferred.

Duplicate grants/edges must be reconciled before this migration is run; do not
delete or merge them implicitly in an upgrade. Invalid concurrent indexes from
an interrupted attempt require an operator-reviewed repair before retry.
"""
from alembic import op

revision = "20261007_3260"
down_revision = "20261007_3250"
branch_labels = None
depends_on = None


def upgrade():
    with op.get_context().autocommit_block():
        op.execute("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_role_permission_pair ON organizer_access.role_permissions (role_id, permission_id)")
        op.execute("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_role_inheritance_pair ON organizer_access.role_inheritance_maps (child_role_id, parent_role_id)")
        op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_scoped_permission_subject_context ON organizer_access.scoped_permissions (user_id, scope_type, scope_id, permission_id)")
        op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_local_role_page ON organizer_access.user_roles (organization_id, id) WHERE deleted_at IS NULL")
        op.execute("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_local_active_role_name ON organizer_access.user_roles (organization_id, lower(name)) WHERE deleted_at IS NULL AND organization_id IS NOT NULL")
        op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_role_assignment_tenant_count ON organizer_access.user_role_assignments (organization_id, role_id, user_id)")
        op.execute("""
            DO $$ BEGIN
              IF EXISTS (
                SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'organizer_access'
                  AND c.relname IN ('uq_role_permission_pair', 'uq_role_inheritance_pair',
                                   'ix_scoped_permission_subject_context', 'ix_local_role_page',
                                   'uq_local_active_role_name', 'ix_role_assignment_tenant_count')
                  AND (NOT i.indisvalid OR NOT i.indisready
                       OR (c.relname IN ('uq_role_permission_pair', 'uq_role_inheritance_pair', 'uq_local_active_role_name') AND NOT i.indisunique))
              ) THEN
                RAISE EXCEPTION 'Role integrity index is invalid; operator-reviewed repair is required before retry';
              END IF;
            END $$
        """)


def downgrade():
    raise RuntimeError("Retain additive role integrity indexes on application rollback; no destructive downgrade.")
