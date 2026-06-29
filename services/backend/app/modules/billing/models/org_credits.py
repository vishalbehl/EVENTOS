import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.platform.models.organization import Organization
    from app.modules.identity.models.user import User
    from app.modules.billing.models.billing_domain_tables import Invoice


class OrgCredit(Base):
    """
    Manual credit ledger entry for an organization.
    Credits can be applied against future invoices.

    credit_type values:
        'MANUAL'        – manually issued by super-admin
        'REFUND'        – refund converted to credit
        'PROMOTIONAL'   – promotional credit (e.g., referral, campaign)
        'COMPENSATION'  – compensation for outage / service degradation
    """
    __tablename__ = "org_credits"
    __table_args__ = {"schema": "billing"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    amount_inr: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    # 'MANUAL' | 'REFUND' | 'PROMOTIONAL' | 'COMPENSATION'
    credit_type: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    applied_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True
    )
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    used_on_invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("billing.invoices.id", ondelete="SET NULL"),
        nullable=True
    )
    used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Relationships ──────────────────────────────────────────────────────
    organization: Mapped["Organization"] = relationship("Organization")
    applied_by_user: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[applied_by]
    )

    def __repr__(self) -> str:
        return (
            f"<OrgCredit id={self.id} org={self.organization_id} "
            f"amount={self.amount_inr} type={self.credit_type}>"
        )
