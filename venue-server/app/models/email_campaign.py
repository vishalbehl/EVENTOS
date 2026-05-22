import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.email_template import EmailTemplate
    from app.models.user import User
    from app.models.session import Session
    from app.models.email_log import EmailLog


class EmailCampaign(Base):
    """
    A bulk email send targeting a filtered set of speakers.
    One campaign uses one template and targets speakers matching a filter.

    recipient_filter values:
        all              → Every speaker in the event
        pending_upload   → Speakers who have not yet uploaded
        specific_session → Speakers in one session (session_id_filter required)
        custom           → Manually selected (not yet implemented)

    status lifecycle: draft → scheduled → sending → sent | failed
    """
    __tablename__ = "email_campaigns"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("email_templates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # For specific_session filter
    session_id_filter: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # all | pending_upload | specific_session | custom
    recipient_filter: Mapped[str] = mapped_column(String(50), nullable=False)

    # NULL = send immediately; set for scheduled sends
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # draft | scheduled | sending | sent | failed
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="draft", index=True
    )
    total_recipients: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────
    event: Mapped["Event"] = relationship("Event", back_populates="email_campaigns")
    template: Mapped["EmailTemplate"] = relationship(
        "EmailTemplate", back_populates="campaigns"
    )
    creator: Mapped[Optional["User"]] = relationship("User")
    session_filter: Mapped[Optional["Session"]] = relationship(
        "Session",
        foreign_keys=[session_id_filter],
        back_populates="email_campaigns",
    )
    email_logs: Mapped[List["EmailLog"]] = relationship(
        "EmailLog", back_populates="campaign", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<EmailCampaign id={self.id} name={self.name} "
            f"status={self.status}>"
        )
