"""Add immutable recommendation snapshots, request attachments, outbox records, and organiser mutation idempotency."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260903_0300"
down_revision = "20260903_0200"
branch_labels = None
depends_on = None
JSON = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    for name in ("organiser_revision_idempotency_key", "organiser_revision_request_hash", "organiser_decision_idempotency_key", "organiser_decision_request_hash"):
        op.add_column("quotes", sa.Column(name, sa.String(128 if name.endswith("key") else 64), nullable=True), schema="business")
    op.create_table("request_event_snapshots",
        sa.Column("id", sa.UUID(), nullable=False), sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False), sa.Column("run_number", sa.Integer(), nullable=False),
        sa.Column("facts", JSON, nullable=False), sa.Column("overrides", JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["request_id"], ["technology_services.service_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"), schema="technology_services")
    op.create_index("ix_request_event_snapshots_request_id", "request_event_snapshots", ["request_id"], schema="technology_services")
    op.create_index("ix_request_event_snapshots_event_id", "request_event_snapshots", ["event_id"], schema="technology_services")
    op.create_table("service_request_attachments",
        sa.Column("id", sa.UUID(), nullable=False), sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("uploaded_by", sa.UUID(), nullable=False), sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False), sa.Column("content_type", sa.String(120), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["request_id"], ["technology_services.service_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"), schema="technology_services")
    op.create_index("ix_service_request_attachments_request_id", "service_request_attachments", ["request_id"], schema="technology_services")
    op.create_table("venue_ops_outbox_events",
        sa.Column("id", sa.UUID(), nullable=False), sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("event_name", sa.String(100), nullable=False), sa.Column("payload", JSON, nullable=False),
        sa.Column("status", sa.String(20), nullable=False), sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"), schema="technology_services")
    op.create_index("ix_venue_ops_outbox_events_event_id", "venue_ops_outbox_events", ["event_id"], schema="technology_services")
    op.create_index("ix_venue_ops_outbox_events_status", "venue_ops_outbox_events", ["status"], schema="technology_services")
    rule_table = sa.table(
        "venue_ops_recommendation_rules",
        sa.column("id", sa.UUID()), sa.column("service_definition_id", sa.UUID()),
        sa.column("metric", sa.String()), sa.column("operator", sa.String()), sa.column("threshold", sa.Numeric()),
        sa.column("quantity_formula", JSON), sa.column("priority", sa.String()), sa.column("explanation", sa.String()),
        sa.column("requires_confirmation", sa.Boolean()), sa.column("is_active", sa.Boolean()), sa.column("version", sa.Integer()),
        schema="technology_services",
    )
    definition_table = sa.table("venue_ops_service_definitions", sa.column("id", sa.UUID()), sa.column("code", sa.String()), schema="technology_services")
    connection = op.get_bind()
    definitions = {row.code: row.id for row in connection.execute(sa.select(definition_table.c.code, definition_table.c.id)).all()}
    rules = [
        ("registration", "registrations", 100, {"type": "ceil_divide", "metric": "registrations", "divisor": 150}, "RECOMMENDED", "Registration desks are recommended to keep attendee queues moving."),
        ("self_check_in", "registrations", 250, {"type": "ceil_divide", "metric": "registrations", "divisor": 150}, "OPTIONAL", "Self check-in helps larger registration cohorts arrive faster."),
        ("srr", "speakers", 20, {"type": "ceil_divide", "metric": "speakers", "divisor": 60}, "RECOMMENDED", "A Speaker Ready Room is recommended for presentation intake and speaker support."),
        ("room_management", "rooms", 2, {"type": "metric", "metric": "rooms"}, "RECOMMENDED", "Room coordination is recommended when sessions run across multiple rooms."),
        ("moderators", "sessions", 4, {"type": "ceil_divide", "metric": "sessions", "divisor": 6}, "OPTIONAL", "Moderation support helps keep a larger programme on time."),
        ("live_stream", "is_hybrid", 1, {"type": "constant", "value": 1}, "RECOMMENDED", "Live streaming is recommended because this event is marked as hybrid."),
        ("recording", "is_hybrid", 1, {"type": "constant", "value": 1}, "OPTIONAL", "Recording preserves sessions for audiences who cannot attend live."),
    ]
    existing = {row[0] for row in connection.execute(sa.select(rule_table.c.service_definition_id)).all()}
    op.bulk_insert(rule_table, [{"id": __import__("uuid").uuid4(), "service_definition_id": definitions[code], "metric": metric, "operator": ">=", "threshold": threshold, "quantity_formula": formula, "priority": priority, "explanation": explanation, "requires_confirmation": False, "is_active": True, "version": 1} for code, metric, threshold, formula, priority, explanation in rules if code in definitions and definitions[code] not in existing])


def downgrade() -> None:
    op.drop_index("ix_venue_ops_outbox_events_status", table_name="venue_ops_outbox_events", schema="technology_services")
    op.drop_index("ix_venue_ops_outbox_events_event_id", table_name="venue_ops_outbox_events", schema="technology_services")
    op.drop_table("venue_ops_outbox_events", schema="technology_services")
    op.drop_index("ix_service_request_attachments_request_id", table_name="service_request_attachments", schema="technology_services")
    op.drop_table("service_request_attachments", schema="technology_services")
    op.drop_index("ix_request_event_snapshots_event_id", table_name="request_event_snapshots", schema="technology_services")
    op.drop_index("ix_request_event_snapshots_request_id", table_name="request_event_snapshots", schema="technology_services")
    op.drop_table("request_event_snapshots", schema="technology_services")
    for name in ("organiser_decision_request_hash", "organiser_decision_idempotency_key", "organiser_revision_request_hash", "organiser_revision_idempotency_key"):
        op.drop_column("quotes", name, schema="business")
