import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, foreign

from app.database import Base

if TYPE_CHECKING:
    from app.modules.agenda.models.session import AgendaSession
    from app.modules.agenda.models.agenda_role import AgendaRole
    from app.modules.agenda.models.presentation_slot import AgendaPresentationSlot
    from app.modules.speakers.models.speaker import Speaker


class AgendaSessionPerson(Base):
    """
    Multi-role faculty assignment linking an agenda session, a role, and optionally a presentation slot.
    """
    __tablename__ = "session_people"
    __table_args__ = {"schema": "agenda"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    speaker_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("speakers.speakers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.agenda_roles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="Speaker"
    )
    name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    presentation_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    talk_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    presentation_slot_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.presentation_slots.id", ondelete="SET NULL"),
        nullable=True,
    )
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    session: Mapped["AgendaSession"] = relationship("AgendaSession", back_populates="session_people")
    speaker: Mapped[Optional["Speaker"]] = relationship("Speaker", foreign_keys=[speaker_id])
    role_ref: Mapped[Optional["AgendaRole"]] = relationship("AgendaRole", back_populates="session_people")
    presentation_slot: Mapped[Optional["AgendaPresentationSlot"]] = relationship("AgendaPresentationSlot", back_populates="assigned_people")
    presentation_files = relationship(
        "PresentationFile",
        primaryjoin="foreign(PresentationFile.session_speaker_id) == AgendaSessionPerson.id",
        viewonly=True,
        order_by="PresentationFile.version_number.desc()",
    )

    @property
    def current_file(self):
        # Never trigger implicit async I/O from a serializer/property access.
        loaded_files = self.__dict__.get("presentation_files")
        if loaded_files is None:
            return None
        return next((item for item in loaded_files if item.is_current_version), None)


SessionPerson = AgendaSessionPerson
