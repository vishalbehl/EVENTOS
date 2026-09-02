import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class NetworkConfig(Base):
    """
    Persisted active network adapter configuration and subnet binding for the venue server.
    Ensures adapter selections and operational subnets persist across restarts and node reboots.
    """
    __table_args__ = {"schema": "venue"}
    __tablename__ = "network_configurations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    active_adapter_name: Mapped[str] = mapped_column(String(100), nullable=False)
    adapter_description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    media_type: Mapped[str] = mapped_column(String(30), default="Ethernet")
    ip_address: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    subnet: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    gateway: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    mac_address: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
