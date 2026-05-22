import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.auth.models.user import User


class RefreshToken(Base):
    """
    Persisted JWT refresh tokens for organizer/admin users.

    Why store refresh tokens in the DB?
    ─────────────────────────────────────
    Access tokens are short-lived (8h) and stateless — no DB lookup needed.
    Refresh tokens are long-lived (30 days) and must be revocable:
      - Logout should invalidate the token immediately
      - Password change should invalidate ALL tokens for the user
      - Suspicious activity should allow per-device revocation

    Token is stored HASHED (SHA-256) — if the DB is compromised,
    raw tokens cannot be used by an attacker.

    One user can have multiple active refresh tokens
    (different devices/browsers). Revoked = is_revoked=True.

    family_id groups tokens from the same login session.
    If a refresh token is reused after rotation (token theft),
    the entire family is invalidated immediately.
    """
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # SHA-256 hash of the actual token — never store plain token
    token_hash: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )

    # Groups tokens from the same login session for family invalidation
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, default=uuid.uuid4, index=True
    )

    # Device/browser context for user-facing session management
    device_info: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    is_revoked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, index=True
    )
    # Set when token is revoked — useful for audit
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_reason: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
        # logout | password_change | token_reuse | admin_revoke
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    # Updated on each successful use (token rotation)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Relationships ─────────────────────────────────────
    user: Mapped["User"] = relationship("User")

    @property
    def is_expired(self) -> bool:
        return datetime.now(timezone.utc) > self.expires_at

    @property
    def is_valid(self) -> bool:
        return not self.is_revoked and not self.is_expired

    def __repr__(self) -> str:
        return (
            f"<RefreshToken user={self.user_id} "
            f"revoked={self.is_revoked} expires={self.expires_at}>"
        )
