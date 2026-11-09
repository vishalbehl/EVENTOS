import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, CheckConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, SoftDeleteMixin

if TYPE_CHECKING:
    from app.modules.events.models.event import Event
    from app.modules.communications.models.email_template import EmailTemplate
    from app.modules.identity.models.user import User
    from app.modules.agenda.models.session import AgendaSession
    from app.modules.agenda.models.room import AgendaRoom
    from app.modules.communications.models.email_log import EmailLog


class EmailCampaign(Base, SoftDeleteMixin):
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
        CheckConstraint("(worker_token IS NULL AND worker_lease_until IS NULL) OR "
            "(worker_token IS NOT NULL AND worker_lease_until IS NOT NULL)", name="ck_campaign_worker_lease"),
        UniqueConstraint("id", "event_id", name="uq_campaign_event_owner"),
        CheckConstraint("(recipient_snapshot_dispatch_id IS NULL AND recipient_snapshot_count IS NULL AND recipient_snapshot_target_type IS NULL) OR "
            "(recipient_snapshot_dispatch_id IS NOT NULL AND recipient_snapshot_count IS NOT NULL AND recipient_snapshot_count >= 0 "
            "AND recipient_snapshot_target_type IS NOT NULL AND recipient_snapshot_target_type IN ('speaker','participant'))",
            name="ck_campaign_snapshot_state"),
        CheckConstraint(
            "status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')",
            name="ck_ec_status"
        ),
        CheckConstraint(
            "recipient_filter IN ('all', 'pending_upload', 'uploaded', 'approved', 'rejected', 'posters', 'specific_session', 'specific_room', 'specific_speakers', 'custom', 'paid', 'unpaid', 'pending', 'specific_participants', 'custom_list')",
            name="ck_ec_filter"
        ),
        CheckConstraint(
            "(send_actor_id IS NULL AND send_organization_id IS NULL AND send_audience IS NULL "
            "AND send_dispatch_id IS NULL AND send_authorized_at IS NULL) OR "
            "(send_actor_id IS NOT NULL AND send_organization_id IS NOT NULL AND send_audience IS NOT NULL "
            "AND send_audience IN ('CUSTOMER','PLATFORM') AND send_dispatch_id IS NOT NULL "
            "AND send_authorized_at IS NOT NULL)", name="ck_campaign_dispatch_authority",
        ),
        {"schema": "communications"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("design.email_templates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    template_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("design.email_template_versions.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # For specific_session filter
    send_actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    worker_token: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    worker_lease_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    recipient_snapshot_dispatch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    recipient_snapshot_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    recipient_snapshot_target_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    send_organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    send_audience: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    send_dispatch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    send_authorized_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    session_id_filter: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    # For specific_room filter
    room_id_filter: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.rooms.id", ondelete="SET NULL"),
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
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default="now()",
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────
    @property
    def dispatch_authorized(self) -> bool:
        """Presence of recorded intent, not a claim that authority is still live."""
        return bool(self.send_actor_id and self.send_organization_id and self.send_audience
                    and self.send_dispatch_id and self.send_authorized_at)

    event: Mapped["Event"] = relationship("Event", back_populates="email_campaigns")
    template: Mapped["EmailTemplate"] = relationship("EmailTemplate")
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])
    session: Mapped[Optional["AgendaSession"]] = relationship(
        "AgendaSession", foreign_keys=[session_id_filter]
    )
    room: Mapped[Optional["AgendaRoom"]] = relationship(
        "AgendaRoom", foreign_keys=[room_id_filter]
    )
    email_logs: Mapped[List["EmailLog"]] = relationship(
        "EmailLog", back_populates="campaign", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<EmailCampaign id={self.id} name={self.name} "
            f"status={self.status}>"
        )
