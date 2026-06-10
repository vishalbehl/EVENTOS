import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.events.models.event import Event
    from app.modules.communications.models.email_template import EmailTemplate
    from app.modules.identity.models.user import User
    from app.modules.events.models.session import Session
    from app.modules.communications.models.email_log import EmailLog


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
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')",
            name="ck_ec_status"
        ),
        CheckConstraint(
            "recipient_filter IN ('all', 'pending_upload', 'uploaded', 'approved', 'rejected', 'posters', 'specific_session', 'specific_room', 'specific_speakers', 'custom', 'paid', 'unpaid', 'pending', 'specific_participants', 'custom_list')",
            name="ck_ec_filter"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("communications.email_templates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # For specific_session filter
    session_id_filter: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    # For specific_room filter
    room_id_filter: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.rooms.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # all | pending_upload | uploaded | specific_session | specific_room | specific_speakers
    recipient_filter: Mapped[str] = mapped_column(String(50), nullable=False)
    target_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="speaker", server_default="speaker"
    )
    # Comma-separated speaker UUIDs for recipient_filter='specific_speakers'
    speaker_id_list: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


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
