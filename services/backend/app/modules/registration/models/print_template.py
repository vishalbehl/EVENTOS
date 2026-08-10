import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, SoftDeleteMixin
from app.modules.events.models.event import Event


class PrintTemplate(Base, SoftDeleteMixin):
    __tablename__ = "print_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    template_name: Mapped[str] = mapped_column(String(255), nullable=False)
    template_type: Mapped[str] = mapped_column(String(30), nullable=False, default="custom")
    template_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationship
    event: Mapped[Optional["Event"]] = relationship("Event")

    def __repr__(self) -> str:
        return f"<PrintTemplate id={self.id} template_name={self.template_name}>"
