"""Append-only claim/outcome evidence, separate from the current log projection."""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CampaignAttempt(Base):
    __tablename__ = "campaign_attempts"
    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "event_id", "campaign_id", "dispatch_id", "recipient_id"],
            ["communications.campaign_recipient_snapshots.organization_id", "communications.campaign_recipient_snapshots.event_id",
             "communications.campaign_recipient_snapshots.campaign_id", "communications.campaign_recipient_snapshots.dispatch_id",
             "communications.campaign_recipient_snapshots.recipient_id"], name="fk_campaign_attempt_snapshot_owner"),
        UniqueConstraint("id", "organization_id", "event_id", "campaign_id", name="uq_campaign_attempt_owner"),
        UniqueConstraint("id", "event_id", "campaign_id", name="uq_campaign_attempt_log_owner"),
        Index("ix_campaign_attempt_dispatch", "organization_id", "event_id", "campaign_id", "dispatch_id"),
        {"schema": "communications"},
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    campaign_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    dispatch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    recipient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class CampaignAttemptOutcome(Base):
    __tablename__ = "campaign_attempt_outcomes"
    __table_args__ = (
        ForeignKeyConstraint(["attempt_id", "organization_id", "event_id", "campaign_id"],
            ["communications.campaign_attempts.id", "communications.campaign_attempts.organization_id",
             "communications.campaign_attempts.event_id", "communications.campaign_attempts.campaign_id"],
            name="fk_campaign_outcome_attempt_owner"),
        UniqueConstraint("attempt_id", "kind", name="uq_campaign_attempt_outcome"),
        Index("uq_campaign_attempt_terminal_outcome", "attempt_id", unique=True,
              postgresql_where=text("kind IN ('ACCEPTED','REJECTED')")),
        CheckConstraint("kind IN ('ACCEPTED','REJECTED','UNCONFIRMED')", name="ck_campaign_outcome_kind"),
        CheckConstraint("(kind = 'ACCEPTED' AND provider_receipt IS NOT NULL) OR "
                        "(kind <> 'ACCEPTED' AND provider_receipt IS NULL)", name="ck_campaign_outcome_receipt"),
        {"schema": "communications"},
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attempt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    campaign_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_receipt: Mapped[str | None] = mapped_column(String(255), nullable=True)
    diagnostic_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
