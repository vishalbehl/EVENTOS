"""make canonical capability rollout explicitly opt-in

Revision ID: 20260729_1160
Revises: 20260728_1150
"""

from alembic import op


revision = "20260729_1160"
down_revision = "20260728_1150"
branch_labels = None
depends_on = None


ROLLOUT_KEYS = (
    "organizer_console_entitlement_shadow",
    "organizer_console_entitlement_enforce",
)


def upgrade() -> None:
    # Existing organizations must have explicit rows so operational queries and
    # future code cannot interpret a missing value as an implicit promotion.
    for flag_key in ROLLOUT_KEYS:
        op.execute(
            f"""
            INSERT INTO platform.feature_flags
                (id, organization_id, flag_key, is_enabled)
            SELECT gen_random_uuid(), organization.id, '{flag_key}', false
            FROM platform.organizations AS organization
            ON CONFLICT (organization_id, flag_key) DO NOTHING
            """
        )


def downgrade() -> None:
    # Rollout rows may have been intentionally changed after this migration.
    # Removing them would discard operator state, so downgrade is deliberately
    # data preserving.
    pass
