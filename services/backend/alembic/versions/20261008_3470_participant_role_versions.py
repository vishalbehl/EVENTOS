"""Additive participant-role concurrency column; preserve historical migrations."""
from alembic import op
import sqlalchemy as sa

revision = "20261008_3470"
down_revision = "20261008_3460"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("participant_roles", sa.Column("version", sa.Integer(),
        nullable=False, server_default="1"), schema="registration")
    op.execute("ALTER TABLE registration.participant_roles ADD CONSTRAINT "
        "ck_participant_role_version_positive CHECK (version > 0) NOT VALID")


def downgrade():
    raise RuntimeError("Retain additive role versions; use a compatible application rollback.")
