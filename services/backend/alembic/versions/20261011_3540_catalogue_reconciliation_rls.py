"""Force tenant/platform isolation on catalogue reconciliation state.

Revision ID: 20261011_3540
Revises: 20261010_3530
"""
from alembic import op


revision = "20261011_3540"
down_revision = "20261010_3530"
branch_labels = None
depends_on = None


_PLATFORM_SCOPE = """
EXISTS (
    SELECT 1
      FROM platform.organizations AS platform_org
     WHERE platform_org.id = platform.current_organization_id()
       AND platform_org.is_platform_org IS TRUE
       AND platform_org.is_active IS TRUE
       AND platform_org.suspended_at IS NULL
       AND platform_org.archived_at IS NULL
)
"""


def _enable_evidence_rls(table: str, resource_scope: str) -> None:
    qualified = f"design.{table}"
    predicate = f"(({resource_scope}) OR ({_PLATFORM_SCOPE}))"
    op.execute(f"ALTER TABLE {qualified} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {qualified} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY category_a_{table}_read ON {qualified} "
        f"FOR SELECT TO PUBLIC USING ({predicate})"
    )
    op.execute(
        f"CREATE POLICY category_a_{table}_append ON {qualified} "
        f"FOR INSERT TO PUBLIC WITH CHECK ({predicate})"
    )


def upgrade() -> None:
    _enable_evidence_rls(
        "form_template_reconciliations",
        """EXISTS (
            SELECT 1 FROM design.form_templates AS owned_template
             WHERE owned_template.id = template_id
               AND owned_template.organization_id = platform.current_organization_id()
        )""",
    )
    _enable_evidence_rls(
        "form_category_reconciliations",
        """EXISTS (
            SELECT 1 FROM design.form_categories AS owned_category
             WHERE owned_category.id = category_id
               AND owned_category.organization_id = platform.current_organization_id()
        )""",
    )
    _enable_evidence_rls(
        "catalogue_document_reconciliations",
        "organization_id = platform.current_organization_id()",
    )

    run_scope = "organization_id = platform.current_organization_id()"
    op.execute("ALTER TABLE design.catalogue_reconciliation_runs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE design.catalogue_reconciliation_runs FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY category_a_catalogue_reconciliation_runs_tenant "
        "ON design.catalogue_reconciliation_runs FOR ALL TO PUBLIC "
        f"USING ({run_scope}) WITH CHECK ({run_scope})"
    )


def downgrade() -> None:
    # Reverting to unrestricted reconciliation evidence would restore a known
    # cross-tenant exposure. Application rollback remains compatible with these
    # policies, so the secure forward state is deliberately retained.
    raise RuntimeError(
        "Forward-only migration: retain forced catalogue reconciliation RLS"
    )
