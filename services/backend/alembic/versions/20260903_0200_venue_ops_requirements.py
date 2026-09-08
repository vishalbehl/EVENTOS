"""Persist Venue Ops requirements, recommendations, and fulfilment handoffs."""

from alembic import op
import sqlalchemy as sa
import uuid
from sqlalchemy.dialects import postgresql

revision = "20260903_0200"
down_revision = "20260903_0100"
branch_labels = None
depends_on = None

JSON = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    # The domain-layout migration can leave the legacy technology_services
    # schema absent. Venue Ops still owns these request records, so make the
    # minimal base tables available before extending them below.
    op.execute("CREATE SCHEMA IF NOT EXISTS technology_services")
    op.execute("""
        CREATE TABLE IF NOT EXISTS technology_services.service_requests (
            id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
            event_id UUID NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
            request_number VARCHAR(50) NOT NULL UNIQUE,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            status VARCHAR(50) NOT NULL,
            priority VARCHAR(20) NOT NULL,
            request_type VARCHAR(50) NOT NULL,
            requested_by UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
            version INTEGER NOT NULL DEFAULT 1,
            approved_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS technology_services.service_request_items (
            id UUID PRIMARY KEY,
            request_id UUID NOT NULL REFERENCES technology_services.service_requests(id) ON DELETE CASCADE,
            description TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
            notes TEXT
        )
    """)
    inspector = sa.inspect(op.get_bind())

    def add_column_if_missing(table: str, column: sa.Column) -> None:
        existing = {item["name"] for item in inspector.get_columns(table, schema="technology_services")}
        if column.name not in existing:
            op.add_column(table, column, schema="technology_services")

    for column in (
        sa.Column("event_snapshot", JSON, nullable=False, server_default="{}"),
        sa.Column("planning_overrides", JSON, nullable=False, server_default="{}"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_by", sa.UUID(), nullable=True),
        sa.Column("owner_user_id", sa.UUID(), nullable=True),
    ):
        add_column_if_missing("service_requests", column)

    op.create_table(
        "venue_ops_service_definitions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("unit_type", sa.String(30), nullable=False),
        sa.Column("requirement_schema", JSON, nullable=False),
        sa.Column("dependencies", JSON, nullable=False),
        sa.Column("template_refs", JSON, nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
        schema="technology_services",
    )
    op.create_index("ix_venue_ops_service_definitions_is_published", "venue_ops_service_definitions", ["is_published"], schema="technology_services")

    op.create_table(
        "venue_ops_recommendation_rules",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("service_definition_id", sa.UUID(), nullable=False),
        sa.Column("metric", sa.String(80), nullable=False),
        sa.Column("operator", sa.String(10), nullable=False),
        sa.Column("threshold", sa.Numeric(14, 2), nullable=False),
        sa.Column("quantity_formula", JSON, nullable=False),
        sa.Column("priority", sa.String(20), nullable=False),
        sa.Column("explanation", sa.String(500), nullable=False),
        sa.Column("requires_confirmation", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["service_definition_id"], ["technology_services.venue_ops_service_definitions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="technology_services",
    )
    op.create_index("ix_venue_ops_rules_service_active", "venue_ops_recommendation_rules", ["service_definition_id", "is_active"], schema="technology_services")

    for table, columns in {
        "service_request_items": [
            sa.Column("service_definition_id", sa.UUID(), nullable=True),
            sa.Column("template_type", sa.String(40), nullable=True),
            sa.Column("template_id", sa.UUID(), nullable=True),
            sa.Column("template_version", sa.String(50), nullable=True),
            sa.Column("source", sa.String(30), nullable=False, server_default="ORGANISER_ADDED"),
            sa.Column("duration_days", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("room_scope", JSON, nullable=False, server_default="[]"),
            sa.Column("configuration", JSON, nullable=False, server_default="{}"),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("included_scope", JSON, nullable=False, server_default="[]"),
            sa.Column("excluded_scope", JSON, nullable=False, server_default="[]"),
        ],
        }.items():
        for column in columns:
            add_column_if_missing(table, column)
    op.create_foreign_key("fk_request_items_service_definition", "service_request_items", "venue_ops_service_definitions", ["service_definition_id"], ["id"], source_schema="technology_services", referent_schema="technology_services", ondelete="SET NULL")

    op.create_table(
        "service_request_comments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=False),
        sa.Column("author_type", sa.String(20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["request_id"], ["technology_services.service_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="technology_services",
    )
    op.create_index("ix_service_request_comments_request_id", "service_request_comments", ["request_id"], schema="technology_services")

    op.create_table(
        "venue_ops_fulfilment_handoffs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("quote_id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("approved_version", sa.Integer(), nullable=False),
        sa.Column("locked_scope", JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["request_id"], ["technology_services.service_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("request_id"),
        sa.UniqueConstraint("quote_id"),
        schema="technology_services",
    )
    op.create_index("ix_venue_ops_handoffs_org_event", "venue_ops_fulfilment_handoffs", ["organization_id", "event_id"], schema="technology_services")

    definitions = [
        ("registration", "Registration desks", "Registration", "attendee", "Registration throughput and desk staffing."),
        ("self_check_in", "Self check-in", "Registration", "kiosk", "Self check-in kiosks and support."),
        ("srr", "Speaker Ready Room", "Speaker operations", "event", "Speaker presentation intake and support."),
        ("room_management", "Room management", "Room operations", "room", "Room coordinators and session operations."),
        ("moderators", "Moderators / chairs", "Programme operations", "person", "Moderation and session chair support."),
        ("live_stream", "Live streaming", "Media production", "room", "Streaming production for selected rooms."),
        ("recording", "Session recording", "Media production", "room", "Recording and media handoff."),
        ("av_support", "Audio / video support", "Technical support", "room", "Onsite AV and technical support."),
        ("networking", "Internet and networking", "Technical support", "event", "Event network and connectivity support."),
        ("technical_helpdesk", "Technical helpdesk", "Technical support", "person", "General onsite technical support."),
    ]
    definition_rows = []
    for code, name, category, unit, description in definitions:
        definition_rows.append({
            "id": uuid.uuid4(), "code": code, "name": name, "category": category,
            "description": description, "unit_type": unit, "requirement_schema": {}, "dependencies": [],
            "template_refs": ([{"type": "registration"}] if code in {"registration", "self_check_in"} else [{"type": "srr"}] if code == "srr" else [{"type": "room"}] if code == "room_management" else []), "is_published": True, "version": 1,
        })
    op.bulk_insert(sa.table("venue_ops_service_definitions", sa.column("id", sa.UUID()), sa.column("code", sa.String()), sa.column("name", sa.String()), sa.column("category", sa.String()), sa.column("description", sa.Text()), sa.column("unit_type", sa.String()), sa.column("requirement_schema", JSON), sa.column("dependencies", JSON), sa.column("template_refs", JSON), sa.column("is_published", sa.Boolean()), sa.column("version", sa.Integer()), schema="technology_services"), definition_rows)


def downgrade() -> None:
    op.drop_index("ix_venue_ops_handoffs_org_event", table_name="venue_ops_fulfilment_handoffs", schema="technology_services")
    op.drop_table("venue_ops_fulfilment_handoffs", schema="technology_services")
    op.drop_index("ix_service_request_comments_request_id", table_name="service_request_comments", schema="technology_services")
    op.drop_table("service_request_comments", schema="technology_services")
    op.drop_constraint("fk_request_items_service_definition", "service_request_items", schema="technology_services", type_="foreignkey")
    for name in ("excluded_scope", "included_scope", "notes", "configuration", "room_scope", "end_date", "start_date", "duration_days", "source", "template_version", "template_id", "template_type", "service_definition_id"):
        op.drop_column("service_request_items", name, schema="technology_services")
    op.drop_index("ix_venue_ops_rules_service_active", table_name="venue_ops_recommendation_rules", schema="technology_services")
    op.drop_table("venue_ops_recommendation_rules", schema="technology_services")
    op.drop_index("ix_venue_ops_service_definitions_is_published", table_name="venue_ops_service_definitions", schema="technology_services")
    op.drop_table("venue_ops_service_definitions", schema="technology_services")
    for name in ("owner_user_id", "submitted_by", "submitted_at", "planning_overrides", "event_snapshot"):
        op.drop_column("service_requests", name, schema="technology_services")
