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

    @property
    def talk_duration_minutes(self) -> int:
        if self.presentation_slot and hasattr(self.presentation_slot, "duration_minutes"):
            return self.presentation_slot.duration_minutes
        return self.__dict__.get("_talk_duration_minutes", 20)

    @talk_duration_minutes.setter
    def talk_duration_minutes(self, value: int):
        self._talk_duration_minutes = value
        if self.presentation_slot and hasattr(self.presentation_slot, "duration_minutes"):
            self.presentation_slot.duration_minutes = value

    @property
    def start_time(self) -> Optional[datetime]:
        if self.presentation_slot and hasattr(self.presentation_slot, "start_time"):
            return self.presentation_slot.start_time
        return self.__dict__.get("_start_time", None)

    @start_time.setter
    def start_time(self, value: Optional[datetime]):
        self._start_time = value
        if self.presentation_slot and hasattr(self.presentation_slot, "start_time"):
            self.presentation_slot.start_time = value

    @property
    def end_time(self) -> Optional[datetime]:
        if self.presentation_slot and hasattr(self.presentation_slot, "end_time"):
            return self.presentation_slot.end_time
        return self.__dict__.get("_end_time", None)

    @end_time.setter
    def end_time(self, value: Optional[datetime]):
        self._end_time = value
        if self.presentation_slot and hasattr(self.presentation_slot, "end_time"):
            self.presentation_slot.end_time = value

    @property
    def speaker_type(self) -> Optional[str]:
        return self.role or self.__dict__.get("_speaker_type", "Speaker")

    @speaker_type.setter
    def speaker_type(self, value: Optional[str]):
        if value:
            self.role = value
        self._speaker_type = value

    @property
    def abstract_text(self) -> Optional[str]:
        return self.__dict__.get("_abstract_text", None)

    @abstract_text.setter
    def abstract_text(self, value: Optional[str]):
        self._abstract_text = value

    @property
    def abstract_keywords(self) -> list:
        return self.__dict__.get("_abstract_keywords", [])

    @abstract_keywords.setter
    def abstract_keywords(self, value: list):
        self._abstract_keywords = value

    @property
    def abstract_status(self) -> str:
        return self.__dict__.get("_abstract_status", "DRAFT")

    @abstract_status.setter
    def abstract_status(self, value: str):
        self._abstract_status = value

    @property
    def abstract_version(self) -> int:
        return self.__dict__.get("_abstract_version", 1)

    @abstract_version.setter
    def abstract_version(self, value: int):
        self._abstract_version = value

    @property
    def abstract_submitted_at(self) -> Optional[datetime]:
        return self.__dict__.get("_abstract_submitted_at", None)

    @abstract_submitted_at.setter
    def abstract_submitted_at(self, value: Optional[datetime]):
        self._abstract_submitted_at = value

    @property
    def abstract_reviewed_at(self) -> Optional[datetime]:
        return self.__dict__.get("_abstract_reviewed_at", None)

    @abstract_reviewed_at.setter
    def abstract_reviewed_at(self, value: Optional[datetime]):
        self._abstract_reviewed_at = value

    @property
    def abstract_review_notes(self) -> Optional[str]:
        return self.__dict__.get("_abstract_review_notes", None)

    @abstract_review_notes.setter
    def abstract_review_notes(self, value: Optional[str]):
        self._abstract_review_notes = value


SessionPerson = AgendaSessionPerson

