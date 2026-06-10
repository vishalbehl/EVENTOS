import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.hybrid import hybrid_property

from app.database import Base
from app.database import SoftDeleteMixin

if TYPE_CHECKING:
    from app.modules.events.models.event import Event
    from app.modules.registration.models.participant_role import ParticipantRole


class Participant(Base, SoftDeleteMixin):
    """
    Conference delegates / participants registered for on-site execution.
    """
    __tablename__ = "participants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    regno: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    first_name: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    last_name: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.roles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    
    company: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    designation: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    approval_status: Mapped[str] = mapped_column(String(50), nullable=False, default="Approved")
    paid_status: Mapped[str] = mapped_column(String(30), nullable=False, default="Unpaid")
    badge_status: Mapped[str] = mapped_column(String(50), nullable=False, default="Unprinted")
    checkin_status: Mapped[str] = mapped_column(String(50), nullable=False, default="Pending")
    
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="offline")
    qr_code_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    custom_fields: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    event: Mapped["Event"] = relationship("Event")
    role_rel: Mapped[Optional["ParticipantRole"]] = relationship("ParticipantRole", lazy="selectin")

    @hybrid_property
    def name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @name.setter
    def name(self, val: str):
        if not val:
            self.first_name = ""
            self.last_name = ""
            return
        parts = val.strip().split(" ", 1)
        self.first_name = parts[0]
        self.last_name = parts[1] if len(parts) > 1 else ""

    @name.expression
    def name(cls):
        from sqlalchemy import func
        return func.concat(cls.first_name, " ", cls.last_name)

    @hybrid_property
    def role(self) -> str:
        return self.role_rel.name if self.role_rel else "Delegate"

    @role.setter
    def role(self, val: str):
        self._role_str = val

    @role.expression
    def role(cls):
        from sqlalchemy import select, func
        from app.modules.registration.models.participant_role import ParticipantRole
        subq = (
            select(ParticipantRole.name)
            .where(ParticipantRole.id == cls.role_id)
            .correlate_except(ParticipantRole)
            .scalar_subquery()
        )
        return func.coalesce(subq, "Delegate")

    @classmethod
    async def find_by_email(cls, db: AsyncSession, event_id: uuid.UUID, email: str) -> Optional["Participant"]:
        from sqlalchemy import select, or_, func
        if not email:
            return None
        lower_email = email.strip().lower()
        stmt = select(cls).where(
            cls.event_id == event_id,
            or_(
                func.lower(cls.email) == lower_email,
                cls.custom_fields["additional_emails"].contains([lower_email])
            )
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    def __repr__(self) -> str:
        return f"<Participant id={self.id} regno={self.regno} name={self.name}>"


from sqlalchemy import event, text

@event.listens_for(Participant, "before_insert")
def before_insert_participant(mapper, connection, target: Participant):
    if target.role_id is None and hasattr(target, "_role_str") and target._role_str:
        res = connection.execute(
            text("SELECT id FROM registration.roles WHERE event_id = :event_id AND name = :name"),
            {"event_id": target.event_id, "name": target._role_str}
        ).fetchone()
        if res:
            target.role_id = res[0]
        else:
            # Fallback to the first default/active role for the event
            res = connection.execute(
                text("SELECT id FROM registration.roles WHERE event_id = :event_id AND is_default = true LIMIT 1"),
                {"event_id": target.event_id}
            ).fetchone()
            if res:
                target.role_id = res[0]

@event.listens_for(Participant, "before_update")
def before_update_participant(mapper, connection, target: Participant):
    if hasattr(target, "_role_str") and target._role_str:
        res = connection.execute(
            text("SELECT id FROM registration.roles WHERE event_id = :event_id AND name = :name"),
            {"event_id": target.event_id, "name": target._role_str}
        ).fetchone()
        if res:
            target.role_id = res[0]
        target._role_str = None
