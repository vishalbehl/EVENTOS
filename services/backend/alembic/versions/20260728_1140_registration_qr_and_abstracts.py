"""Add governed registration QR credentials and speaker abstract workflow.

Revision ID: 20260728_1140
Revises: 20260728_1130
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260728_1140"
down_revision = "20260728_1130"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "confirmation_qr_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "credential_version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        sa.Column(
            "status",
            sa.String(length=24),
            nullable=False,
            server_default="ACTIVE",
        ),
        sa.Column("idempotency_key", sa.String(length=200), nullable=False),
        sa.Column("issued_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "issued_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "credential_version > 0",
            name="ck_confirmation_qr_positive_version",
        ),
        sa.CheckConstraint(
            "status IN ('ACTIVE', 'REVOKED')",
            name="ck_confirmation_qr_status",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["platform.organizations.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["events.events.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["participant_id"],
            ["registration.participants.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["issued_by"],
            ["identity.users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "participant_id",
            name="uq_registration_confirmation_qr_participant",
        ),
        sa.UniqueConstraint(
            "organization_id",
            "idempotency_key",
            name="uq_registration_confirmation_qr_idempotency",
        ),
        schema="registration",
    )
    op.create_index(
        "ix_registration_confirmation_qr_organization_id",
        "confirmation_qr_credentials",
        ["organization_id"],
        schema="registration",
    )
    op.create_index(
        "ix_registration_confirmation_qr_event_id",
        "confirmation_qr_credentials",
        ["event_id"],
        schema="registration",
    )
    op.create_index(
        "ix_registration_confirmation_qr_participant_id",
        "confirmation_qr_credentials",
        ["participant_id"],
        schema="registration",
    )
    op.create_index(
        "ix_registration_confirmation_qr_status",
        "confirmation_qr_credentials",
        ["status"],
        schema="registration",
    )
    op.create_index(
        "ix_registration_confirmation_qr_event_status",
        "confirmation_qr_credentials",
        ["event_id", "status"],
        schema="registration",
    )
    op.execute(
        "ALTER TABLE registration.confirmation_qr_credentials "
        "ENABLE ROW LEVEL SECURITY"
    )
    op.execute(
        "CREATE POLICY tenant_isolation_confirmation_qr_credentials "
        "ON registration.confirmation_qr_credentials "
        "USING (organization_id = platform.current_organization_id()) "
        "WITH CHECK (organization_id = platform.current_organization_id())"
    )

    op.add_column(
        "session_speakers",
        sa.Column("abstract_text", sa.Text(), nullable=True),
        schema="events",
    )
    op.add_column(
        "session_speakers",
        sa.Column(
            "abstract_keywords",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        schema="events",
    )
    op.add_column(
        "session_speakers",
        sa.Column(
            "abstract_status",
            sa.String(length=24),
            nullable=False,
            server_default="DRAFT",
        ),
        schema="events",
    )
    op.add_column(
        "session_speakers",
        sa.Column(
            "abstract_version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        schema="events",
    )
    op.add_column(
        "session_speakers",
        sa.Column(
            "abstract_submitted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        schema="events",
    )
    op.add_column(
        "session_speakers",
        sa.Column(
            "abstract_reviewed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        schema="events",
    )
    op.add_column(
        "session_speakers",
        sa.Column(
            "abstract_reviewed_by",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        schema="events",
    )
    op.add_column(
        "session_speakers",
        sa.Column("abstract_review_notes", sa.Text(), nullable=True),
        schema="events",
    )
    op.add_column(
        "session_speakers",
        sa.Column("abstract_idempotency_key", sa.String(length=200), nullable=True),
        schema="events",
    )
    op.create_foreign_key(
        "fk_session_speakers_abstract_reviewed_by",
        "session_speakers",
        "users",
        ["abstract_reviewed_by"],
        ["id"],
        source_schema="events",
        referent_schema="identity",
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_session_speakers_abstract_status",
        "session_speakers",
        (
            "abstract_status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', "
            "'ACCEPTED', 'REJECTED', 'REVISION_REQUESTED', 'WITHDRAWN')"
        ),
        schema="events",
    )
    op.create_check_constraint(
        "ck_session_speakers_abstract_positive_version",
        "session_speakers",
        "abstract_version > 0",
        schema="events",
    )
    op.create_index(
        "ix_events_session_speakers_abstract_status",
        "session_speakers",
        ["abstract_status"],
        schema="events",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_events_session_speakers_abstract_status",
        table_name="session_speakers",
        schema="events",
    )
    op.drop_constraint(
        "ck_session_speakers_abstract_positive_version",
        "session_speakers",
        schema="events",
        type_="check",
    )
    op.drop_constraint(
        "ck_session_speakers_abstract_status",
        "session_speakers",
        schema="events",
        type_="check",
    )
    op.drop_constraint(
        "fk_session_speakers_abstract_reviewed_by",
        "session_speakers",
        schema="events",
        type_="foreignkey",
    )
    for column in (
        "abstract_idempotency_key",
        "abstract_review_notes",
        "abstract_reviewed_by",
        "abstract_reviewed_at",
        "abstract_submitted_at",
        "abstract_version",
        "abstract_status",
        "abstract_keywords",
        "abstract_text",
    ):
        op.drop_column("session_speakers", column, schema="events")

    op.execute(
        "DROP POLICY IF EXISTS tenant_isolation_confirmation_qr_credentials "
        "ON registration.confirmation_qr_credentials"
    )
    op.drop_table("confirmation_qr_credentials", schema="registration")
