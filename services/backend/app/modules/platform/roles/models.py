# app/modules/platform/roles/models.py
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, String, Text, DateTime, ForeignKey, Index, UniqueConstraint, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, SoftDeleteMixin

if TYPE_CHECKING:
    from app.modules.platform.departments.models import Department
    from app.modules.platform.teams.models import Team
    from app.modules.platform.models.organization import Organization
    from app.modules.identity.models.user import User
    from app.modules.platform.permissions.models import PlatformRolePermission


class DepartmentRole(Base, SoftDeleteMixin):
    __tablename__ = "department_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("command_center_access.departments.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    access_level: Mapped[str] = mapped_column(String(50), nullable=False, default="DEPARTMENT") # GLOBAL, DEPARTMENT, TEAM, SELF

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Relationships
    department: Mapped[Optional["Department"]] = relationship("Department", back_populates="roles")
    organization: Mapped["Organization"] = relationship("Organization", foreign_keys=[organization_id])
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])
    updater: Mapped[Optional["User"]] = relationship("User", foreign_keys=[updated_by])
    deleter: Mapped[Optional["User"]] = relationship("User", primaryjoin="DepartmentRole.deleted_by == User.id")

    # Note: Target role_permissions by string to avoid circular dependency
    permissions: Mapped[List["PlatformRolePermission"]] = relationship(
        "PlatformRolePermission",
        back_populates="role",
        cascade="all, delete-orphan"
    )
    assignments: Mapped[List["UserAssignment"]] = relationship(
        "UserAssignment",
        back_populates="role",
        cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_dept_role_org_code", "organization_id", "code"),
        UniqueConstraint("organization_id", "department_id", "code", name="uq_dept_role_org_dept_code"),
    )

    def __repr__(self) -> str:
        return f"<DepartmentRole id={self.id} code={self.code} name={self.name}>"


class UserAssignment(Base, SoftDeleteMixin):
    __tablename__ = "user_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("command_center_access.departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("command_center_access.teams.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("command_center_access.department_roles.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", foreign_keys=[organization_id])
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    department: Mapped["Department"] = relationship("Department", back_populates="assignments")
    team: Mapped[Optional["Team"]] = relationship("Team", back_populates="assignments")
    role: Mapped["DepartmentRole"] = relationship("DepartmentRole", back_populates="assignments")
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])
    updater: Mapped[Optional["User"]] = relationship("User", foreign_keys=[updated_by])
    deleter: Mapped[Optional["User"]] = relationship("User", primaryjoin="UserAssignment.deleted_by == User.id")

    __table_args__ = (
        UniqueConstraint("user_id", "department_id", "team_id", "role_id", name="uq_user_assignment"),
    )

    def __repr__(self) -> str:
        return f"<UserAssignment id={self.id} user_id={self.user_id} dept_id={self.department_id} role_id={self.role_id}>"
