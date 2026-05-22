import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.email_campaign import EmailCampaign
    from app.models.speaker import Speaker


class EmailLog(Base):
    """
    Delivery record for every individual email sent to a speaker.
    campaign_id is NULL for system-triggered emails
    (e.g. auto validation result notifications).

    status lifecycle: queued → sent → delivered | bounced | failed
    """
    __tablename__ = "email_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # NULL for system-triggered (non-campaign) emails
    campaign_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("email_campaigns.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    speaker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("speakers.id", ondelete="CASCADE"),
        nullable=False,
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
    speaker: Mapped["Speaker"] = relationship(
        "Speaker", back_populates="email_logs"
    )

    def __repr__(self) -> str:
        return (
            f"<EmailLog id={self.id} to={self.to_email} "
            f"status={self.status}>"
        )
