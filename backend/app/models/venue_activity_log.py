import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, Float, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.srr_station import SRRStation
    from app.models.speaker import Speaker
    from app.models.user import User
    from app.models.presentation_file import PresentationFile


class VenueActivityLog(Base):
    """
    Renamed and extended from SRRActivityLog.
    Covers the full venue intake/presentation workflow with device/session correlation.
    """
    __tablename__ = "venue_activity_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # ── Correlation ──────────────────────────────────────
    correlation_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True) # Linked to RoomDevice or SRRStation
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    
    # ── Context ──────────────────────────────────────────
    station_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("srr_stations.id", ondelete="SET NULL"), nullable=True, index=True)
    speaker_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("speakers.id", ondelete="SET NULL"), nullable=True, index=True)
    performed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    file_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("presentation_files.id", ondelete="SET NULL"), nullable=True)

    # ── Actions ──────────────────────────────────────────
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    action_category: Mapped[str] = mapped_column(String(50), index=True) # INTAKE, PRESENTATION, SYSTEM, SECURITY
    
    # ── Operational Metadata ─────────────────────────────
    details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column() # For timed interactions
    app_version: Mapped[Optional[str]] = mapped_column(String(50))
    
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)

    # ── Relationships ─────────────────────────────────────
    event: Mapped["Event"] = relationship("Event", back_populates="venue_activity_logs")
    station: Mapped[Optional["SRRStation"]] = relationship("SRRStation", back_populates="activity_logs")
    speaker: Mapped[Optional["Speaker"]] = relationship("Speaker", back_populates="venue_activity_logs")
    technician: Mapped[Optional["User"]] = relationship("User") # No back-populates needed for general user audit
    file: Mapped[Optional["PresentationFile"]] = relationship("PresentationFile", back_populates="venue_activity_logs")

    __table_args__ = (
        CheckConstraint(
            "action_category IN ('INTAKE', 'PRESENTATION', 'SYSTEM', 'SECURITY', 'PORTAL', 'FILE', 'FILE_OPS', 'REVIEWS')",
            name="ck_val_category"
        ),
    )
