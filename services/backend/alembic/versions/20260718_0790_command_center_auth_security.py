"""Add indexes for Command Center authentication attempt fallback.

Revision ID: command_center_auth_security_0790
Revises: operations_center_control_0780
"""

from alembic import op

revision = "command_center_auth_security_0790"
down_revision = "operations_center_control_0780"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_login_attempts_email_attempted_at", "login_attempts", ["email", "attempted_at"], schema="identity")
    op.create_index("ix_login_attempts_ip_attempted_at", "login_attempts", ["ip_address", "attempted_at"], schema="identity")


def downgrade() -> None:
    op.drop_index("ix_login_attempts_ip_attempted_at", table_name="login_attempts", schema="identity")
    op.drop_index("ix_login_attempts_email_attempted_at", table_name="login_attempts", schema="identity")
