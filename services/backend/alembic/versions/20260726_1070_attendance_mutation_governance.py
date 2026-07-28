"""Govern attendance mutations and enforce unique check-ins.

Revision ID: 20260726_1070
Revises: 20260726_1060
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260726_1070"
down_revision = "20260726_1060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Keep the earliest legacy record before enforcing domain idempotency.
    op.execute("""
        DELETE FROM registration.attendance duplicate
        USING registration.attendance canonical
        WHERE duplicate.event_id = canonical.event_id
          AND duplicate.participant_id = canonical.participant_id
          AND duplicate.session_id = canonical.session_id
          AND (
              duplicate.check_in_time > canonical.check_in_time
              OR (duplicate.check_in_time = canonical.check_in_time AND duplicate.id::text > canonical.id::text)
          )
    """)
    op.create_unique_constraint(
        "uq_attendance_event_participant_session",
        "attendance",
        ["event_id", "participant_id", "session_id"],
        schema="registration",
    )
    op.execute("""
        DELETE FROM analytics.attendance_logs duplicate
        USING analytics.attendance_logs canonical
        WHERE duplicate.participant_id = canonical.participant_id
          AND duplicate.session_id = canonical.session_id
          AND duplicate.checkout_time IS NULL
          AND canonical.checkout_time IS NULL
          AND (
              duplicate.checkin_time > canonical.checkin_time
              OR (duplicate.checkin_time = canonical.checkin_time AND duplicate.id::text > canonical.id::text)
          )
    """)
    op.create_index(
        "uq_attendance_logs_active_participant_session",
        "attendance_logs",
        ["participant_id", "session_id"],
        unique=True,
        schema="analytics",
        postgresql_where=sa.text("checkout_time IS NULL"),
    )
    op.create_table(
        "attendance_mutations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation_type", sa.String(length=30), nullable=False),
        sa.Column("idempotency_key", sa.String(length=200), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("result_checkin_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("result_attendance_log_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("result_created", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["identity.users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["result_checkin_id"], ["registration.attendance.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["result_attendance_log_id"], ["analytics.attendance_logs.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "event_id", "operation_type", "idempotency_key",
            name="uq_attendance_mutations_event_operation_idempotency",
        ),
        schema="registration",
    )
    op.create_index("ix_attendance_mutations_organization_id", "attendance_mutations", ["organization_id"], schema="registration")
    op.create_index("ix_attendance_mutations_event_id", "attendance_mutations", ["event_id"], schema="registration")


def downgrade() -> None:
    op.drop_index("ix_attendance_mutations_event_id", table_name="attendance_mutations", schema="registration")
    op.drop_index("ix_attendance_mutations_organization_id", table_name="attendance_mutations", schema="registration")
    op.drop_table("attendance_mutations", schema="registration")
    op.drop_index("uq_attendance_logs_active_participant_session", table_name="attendance_logs", schema="analytics")
    op.drop_constraint("uq_attendance_event_participant_session", "attendance", schema="registration", type_="unique")
