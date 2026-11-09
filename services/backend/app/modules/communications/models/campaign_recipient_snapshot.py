"""Immutable recipient cohort belonging to one authorised campaign dispatch."""
import uuid
from sqlalchemy import ForeignKeyConstraint, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CampaignRecipientSnapshot(Base):
    __tablename__ = "campaign_recipient_snapshots"
    __table_args__ = (
        UniqueConstraint("organization_id", "event_id", "campaign_id", "dispatch_id", "recipient_id",
                         name="uq_campaign_snapshot_attempt_owner"),
        ForeignKeyConstraint(["organization_id", "event_id"],
            ["events.events.organization_id", "events.events.id"], name="fk_campaign_snapshot_event_owner"),
        ForeignKeyConstraint(["campaign_id", "event_id"],
            ["communications.email_campaigns.id", "communications.email_campaigns.event_id"],
            name="fk_campaign_snapshot_campaign_owner"),
        UniqueConstraint("dispatch_id", "to_email", name="uq_campaign_snapshot_email"),
        {"schema": "communications"},
    )
    dispatch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    recipient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    campaign_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    to_email: Mapped[str] = mapped_column(String(320), nullable=False)
