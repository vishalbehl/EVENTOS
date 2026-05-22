import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.user import User
    from app.models.email_campaign import EmailCampaign


class EmailTemplate(Base):
    """
    Reusable email templates with {{variable}} placeholder syntax.
    Templates can be global (event_id=NULL) or event-specific.

    Template types:
        upload_invite   → Initial invitation with upload link
        reminder        → Upload deadline reminder (48h, 24h)
        deadline        → Final deadline warning
        approval        → File approved by organizer
        rejection       → File rejected with reason
        confirmation    → Upload received and validated
    """
    __tablename__ = "email_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # NULL = global template available to all events
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # upload_invite | reminder | deadline | approval | rejection | confirmation
    template_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )
    target_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="speaker", server_default="speaker"
    )


    # Subject supports variables: "Your upload link for {{EventName}}"
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    # Full HTML body with {{SpeakerName}}, {{UploadLink}}, etc.
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    # Plain text fallback for clients that don't render HTML
    body_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # System defaults cannot be deleted — only customized
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────
    event: Mapped[Optional["Event"]] = relationship(
        "Event", back_populates="email_templates"
    )
    creator: Mapped[Optional["User"]] = relationship("User")
    campaigns: Mapped[List["EmailCampaign"]] = relationship(
        "EmailCampaign", back_populates="template"
    )

    def __repr__(self) -> str:
        return (
            f"<EmailTemplate id={self.id} type={self.template_type} "
            f"name={self.name}>"
        )
