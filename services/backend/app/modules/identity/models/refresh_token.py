import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, String, Text
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.identity.models.user import User


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
    __table_args__ = (
        CheckConstraint(
            "access_mode IN ('DIRECT', 'DELEGATED')",
            name="ck_refresh_token_access_mode",
        ),
        CheckConstraint(
            "(access_mode = 'DIRECT' AND acting_organization_id = active_organization_id "
            "AND relationship_id IS NULL AND active_event_id IS NULL) OR "
            "(access_mode = 'DELEGATED' AND relationship_id IS NOT NULL "
            "AND active_workspace_id IS NOT NULL "
            "AND acting_organization_id <> active_organization_id)",
            name="ck_refresh_token_context_shape",
        ),
        ForeignKeyConstraint(["active_organization_id"], ["platform.organizations.id"],
                             name="fk_refresh_context_organization"),
        ForeignKeyConstraint(["acting_organization_id"], ["platform.organizations.id"],
                             name="fk_refresh_context_actor_organization"),
        ForeignKeyConstraint(
            ["active_organization_id", "active_workspace_id"],
            ["organizer_access.operational_workspaces.organization_id", "organizer_access.operational_workspaces.id"],
            name="fk_refresh_context_workspace",
        ),
        ForeignKeyConstraint(
            ["active_organization_id", "active_event_id"],
            ["events.events.organization_id", "events.events.id"],
            name="fk_refresh_context_event",
        ),
        ForeignKeyConstraint(
            ["relationship_id", "active_organization_id", "acting_organization_id"],
            ["organizer_access.emc_client_relationships.id", "organizer_access.emc_client_relationships.client_organization_id",
             "organizer_access.emc_client_relationships.emc_organization_id"],
            name="fk_refresh_context_relationship",
        ),
        {"schema": "identity"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="CASCADE"),
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

    # The selected operational context belongs to this browser/device session,
    # not to the identity record. Every request still revalidates live access.
    access_mode: Mapped[str] = mapped_column(
        String(12), nullable=False, default="DIRECT", server_default="DIRECT"
    )
    active_organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    acting_organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    active_workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    active_event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    relationship_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
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
    mfa_authenticated_at: Mapped[Optional[datetime]] = mapped_column(
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
