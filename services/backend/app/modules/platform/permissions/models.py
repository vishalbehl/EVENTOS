# app/modules/platform/permissions/models.py
import uuid
from typing import TYPE_CHECKING, Optional
from sqlalchemy import String, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.platform.roles.models import DepartmentRole


class PlatformPermission(Base):
    __tablename__ = "permissions"
    __table_args__ = {"schema": "command_center_access"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    module: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<PlatformPermission id={self.id} code={self.code} module={self.module}>"


class PlatformRolePermission(Base):
    __tablename__ = "role_permissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Explicit schema paths to bypass ForeignKey rewriter in SchemaDeclarativeMeta
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("command_center_access.department_roles.id", ondelete="CASCADE"),
        nullable=False
    )
    permission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("command_center_access.permissions.id", ondelete="CASCADE"),
        nullable=False
    )

    # Relationships
    role: Mapped["DepartmentRole"] = relationship("DepartmentRole", back_populates="permissions")
    permission: Mapped["PlatformPermission"] = relationship("PlatformPermission")

    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_platform_role_permission"),
        {"schema": "command_center_access"},
    )

    def __repr__(self) -> str:
        return f"<PlatformRolePermission id={self.id} role_id={self.role_id} permission_id={self.permission_id}>"
