import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event



class Speaker(Base):
    """
    A conference speaker. Speakers do NOT need login accounts.
    Authentication is via upload_token embedded in their email link.

    A speaker belongs to exactly one event. If the same person
    speaks at two events, they get two speaker records.
    """
    __table_args__ = {"schema": "presentations"}
    __tablename__ = "speakers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Optional link to a system user account (if speaker is also an organizer)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    affiliation: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Upload Token (the heart of speaker auth) ──────────
    # UUID v4 token embedded in speaker's email link
    # stored as hashed value — never store plain token in DB
    upload_token: Mapped[str] = mapped_column(
        String(128), unique=True, nullable=False, index=True
    )
    token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Upload Status ─────────────────────────────────────
    # pending | uploaded | replaced | approved | rejected
    upload_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", index=True
    )

    # ── On-site SRR ───────────────────────────────────────
    qr_code_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    checked_in_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────
    event: Mapped["Event"] = relationship("Event")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def current_file(self) -> Optional["PresentationFile"]:
        """Returns the current active file version, or None."""
        return None

    def __repr__(self) -> str:
        return (
            f"<Speaker id={self.id} name={self.full_name} "
            f"status={self.upload_status}>"
        )
