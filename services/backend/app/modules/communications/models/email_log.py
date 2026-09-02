import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, Boolean, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.communications.models.email_campaign import EmailCampaign
    from app.modules.events.models.speaker import Speaker
    from app.modules.registration.models.participant import Participant


class EmailLog(Base):
    """
    Delivery record for every individual email sent to a speaker or participant.
    campaign_id is NULL for system-triggered emails.
    """
    __tablename__ = "email_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # NULL for system-triggered (non-campaign) emails
    campaign_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("communications.email_campaigns.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=True, index=True
    )
    speaker_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("speakers.speakers.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    participant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.participants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    to_email: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)

    # queued | sent | delivered | bounced | failed
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="queued", index=True
    )
    # Message ID from email provider (Resend/Brevo) for tracking
    provider_message_id: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    css_inlined: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    opened_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # ── Relationships ─────────────────────────────────────
    campaign: Mapped[Optional["EmailCampaign"]] = relationship(
        "EmailCampaign", back_populates="email_logs"
    )
    speaker: Mapped[Optional["Speaker"]] = relationship(
        "Speaker", back_populates="email_logs"
    )
    participant: Mapped[Optional["Participant"]] = relationship(
        "Participant"
    )

    __table_args__ = (
        # System-triggered emails have a NULL campaign_id and are intentionally
        # outside campaign-recipient idempotency.
        Index(
            "uq_email_logs_campaign_recipient",
            "campaign_id",
            "to_email",
            unique=True,
            postgresql_where=text("campaign_id IS NOT NULL"),
        ),
        Index(
            "ix_email_logs_event_sent_id",
            "event_id",
            "sent_at",
            "id",
        ),
        {"schema": "communications"},
    )


    def __repr__(self) -> str:
        return (
            f"<EmailLog id={self.id} to={self.to_email} "
            f"status={self.status}>"
        )
