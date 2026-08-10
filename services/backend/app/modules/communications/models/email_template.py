import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, SoftDeleteMixin

if TYPE_CHECKING:
    from app.modules.events.models.event import Event
    from app.modules.identity.models.user import User
    from app.modules.communications.models.email_campaign import EmailCampaign
    from app.modules.communications.models.email_template_version import EmailTemplateVersion


class EmailTemplate(Base, SoftDeleteMixin):
    """
    Templates can be global (event_id=NULL) or event-specific.

    Template types:
        upload_invite   → Initial invitation with upload link
        reminder        → Upload deadline reminder (48h, 24h)
        deadline        → Final deadline warning
        approval        → File approved by organizer
        rejection       → File rejected with reason
        confirmation    → Upload received and validated
    """
    __tablename__ = "email_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # NULL = global template available to all events
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # upload_invite | reminder | deadline | approval | rejection | confirmation
    template_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    scope_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="EVENT", server_default="EVENT", index=True
    )
    stable_key: Mapped[str] = mapped_column(String(100), nullable=False, default="custom", index=True)
    parent_template_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("communications.email_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    current_published_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    target_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="speaker", server_default="speaker"
    )

    # Subject supports variables: "Your upload link for {{EventName}}"
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    preheader: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Full HTML body with {{SpeakerName}}, {{UploadLink}}, etc.
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    # Plain text fallback for clients that don't render HTML
    body_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Store the Email Designer layout JSON
    designer_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # System defaults cannot be deleted — only customized
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    created_at: Mapped[datetime] = mapped_column(
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

    # ── Relationships ─────────────────────────────────────
    event: Mapped[Optional["Event"]] = relationship(
        "Event", back_populates="email_templates"
    )
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])
    campaigns: Mapped[List["EmailCampaign"]] = relationship(
        "EmailCampaign", back_populates="template"
    )
    versions: Mapped[List["EmailTemplateVersion"]] = relationship(
        "EmailTemplateVersion",
        back_populates="template",
        foreign_keys="EmailTemplateVersion.template_id",
        cascade="all, delete-orphan",
        order_by="EmailTemplateVersion.version_number.desc()",
    )
    parent_template: Mapped[Optional["EmailTemplate"]] = relationship(
        "EmailTemplate", remote_side=[id], foreign_keys=[parent_template_id]
    )

    def __repr__(self) -> str:
        return (
            f"<EmailTemplate id={self.id} type={self.template_type} "
            f"name={self.name}>"
        )
