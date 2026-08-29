import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.platform.models.organization import Organization
    from app.modules.identity.models.user import User


class FinancialAuditTrail(Base):
    """
    Immutable log of all financial events in the platform.
    Records are append-only — no updates or deletes should be performed.

    activity_type values:
        'INVOICE_CREATED' | 'PAYMENT_RECEIVED' | 'REFUND_APPROVED' |
        'CREDIT_NOTE_ISSUED' | 'GATEWAY_CONFIG_CHANGED' |
        'SUBSCRIPTION_CREATED' | 'PLAN_CHANGED' | 'TAX_RULE_UPDATED'

    entity_type values:
        'INVOICE' | 'PAYMENT' | 'REFUND' | 'CREDIT_NOTE' | 'GATEWAY' | 'SUBSCRIPTION'
    """
    __tablename__ = "financial_audit_trail"
    __table_args__ = (
        Index("idx_financial_audit_trail_org_time", "organization_id", "occurred_at"),
        Index("idx_financial_audit_trail_type", "activity_type", "occurred_at"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # 'INVOICE_CREATED' | 'PAYMENT_RECEIVED' | 'REFUND_APPROVED' | etc.
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # 'INVOICE' | 'PAYMENT' | 'REFUND' | 'CREDIT_NOTE' | 'GATEWAY' | 'SUBSCRIPTION'
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    entity_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="SET NULL"),
        nullable=True
    )
    performed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True
    )

    amount_inr: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # ── Relationships ──────────────────────────────────────────────────────
    organization: Mapped[Optional["Organization"]] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    performed_by_user: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[performed_by]
    )

    def __repr__(self) -> str:
        return (
            f"<FinancialAuditTrail type={self.activity_type} "
            f"entity={self.entity_type}:{self.entity_id} "
            f"at={self.occurred_at}>"
        )
