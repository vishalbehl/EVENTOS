import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.platform.models.organization import Organization
    from app.modules.identity.models.user import User
    from app.modules.billing.models.billing_domain_tables import Invoice


class CreditNote(Base):
    """
    Formal credit note issued against an invoice.
    Linked to the original invoice and optionally applied to another invoice.

    status values:
        'ISSUED'    – issued and outstanding
        'PENDING'   – pending approval
        'CANCELLED' – cancelled / voided
        'APPLIED'   – applied to a new/future invoice
    """
    __tablename__ = "credit_notes"
    __table_args__ = {"schema": "commerce"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # e.g. 'CN-2026-000042'
    credit_note_number: Mapped[str] = mapped_column(
        String(30), nullable=False, unique=True, index=True
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("commerce.invoices.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    amount_inr: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    gst_amount: Mapped[float] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 'ISSUED' | 'PENDING' | 'CANCELLED' | 'APPLIED'
    status: Mapped[str] = mapped_column(
        String(20), default="ISSUED", server_default="ISSUED"
    )

    issued_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True
    )
    issued_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    applied_to_invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.invoices.id", ondelete="RESTRICT"), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status_changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )
    applied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )

    # ── Relationships ──────────────────────────────────────────────────────
    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    issuing_user: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[issued_by]
    )

    def __repr__(self) -> str:
        return (
            f"<CreditNote number={self.credit_note_number!r} "
            f"amount={self.amount_inr} status={self.status}>"
        )
