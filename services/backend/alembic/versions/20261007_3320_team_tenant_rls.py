"""Fail-closed tenant fences for team authority and binding records."""
from alembic import op

revision = "20261007_3320"
down_revision = "20261007_3310"
branch_labels = None
depends_on = None

TABLES = ("organization_teams", "organization_team_members", "organization_team_events")


def upgrade():
    predicate = "organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid"
    for table in TABLES:
        fullname = f"organizer_access.{table}"
        op.execute(f"ALTER TABLE {fullname} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {fullname} FORCE ROW LEVEL SECURITY")
        # The restrictive fence also bounds any older permissive policies.
        # No platform identity or global role is a database bypass.
        for name, mode in ((f"category_a_tenant_{table}", "PERMISSIVE"),
                           (f"category_a_fence_{table}", "RESTRICTIVE")):
            op.execute(f"DROP POLICY IF EXISTS {name} ON {fullname}")
            op.execute(f"CREATE POLICY {name} ON {fullname} AS {mode} FOR ALL TO PUBLIC "
                       f"USING ({predicate}) WITH CHECK ({predicate})")


def downgrade():
    raise RuntimeError("Retain team isolation on application rollback; use fail-closed containment.")
