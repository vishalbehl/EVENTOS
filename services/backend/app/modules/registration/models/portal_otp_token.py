import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PortalOtpToken(Base):
    """
    Short-lived OTP tokens for attendee portal email authentication.

    Flow
    ----
    1. POST /portal/auth/request-otp  → creates one row (bcrypt hash stored)
    2. POST /portal/auth/verify-otp   → increments attempts, marks used=True on success
    3. Background task every 6h       → purges rows older than 24h that are used or expired
    """
    __tablename__ = "portal_otp_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    # bcrypt hash of the 6-digit OTP — plaintext is never persisted
    otp_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # Incremented on every failed verify attempt; token locked at >= 5
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return (
            f"<PortalOtpToken email={self.email} event={self.event_id} "
            f"used={self.used} expires={self.expires_at}>"
        )
