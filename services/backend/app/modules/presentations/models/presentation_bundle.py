import enum
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.rbac.models.event import Event
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.speakers.models.session_speaker import SessionSpeaker


class ChainMode(str, enum.Enum):
    sequential = "sequential"
    manual = "manual"


class PresentationBundle(Base):
    """Ordered multi-deck package for one speaker slot."""

    __tablename__ = "presentation_bundles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_speaker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("session_speakers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    chain_mode: Mapped[ChainMode] = mapped_column(
        Enum(ChainMode), nullable=False, default=ChainMode.manual
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    event: Mapped["Event"] = relationship("Event", back_populates="presentation_bundles")
    owner_session_speaker: Mapped["SessionSpeaker"] = relationship(
        "SessionSpeaker",
        back_populates="presentation_bundles",
        foreign_keys=[session_speaker_id],
    )
    session_speaker: Mapped["SessionSpeaker"] = relationship(
        "SessionSpeaker",
        back_populates="presentation_bundle",
        foreign_keys="SessionSpeaker.presentation_bundle_id",
    )
    files: Mapped[List["BundleFile"]] = relationship(
        "BundleFile",
        back_populates="bundle",
        cascade="all, delete-orphan",
        order_by="BundleFile.deck_order",
    )


class BundleFile(Base):
    __tablename__ = "bundle_files"
    __table_args__ = (
        UniqueConstraint("bundle_id", "file_id", name="uq_bundle_files_file"),
        UniqueConstraint("bundle_id", "deck_order", name="uq_bundle_files_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bundle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentation_bundles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentation_files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    deck_order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    bundle: Mapped["PresentationBundle"] = relationship("PresentationBundle", back_populates="files")
    file: Mapped["PresentationFile"] = relationship("PresentationFile", back_populates="bundle_entries")
