import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional, Dict, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Integer, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.organization import Organization
    from app.models.event import Event

class Role(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_system_role: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1) # Optimistic concurrency
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    permissions: Mapped[List["RolePermission"]] = relationship("RolePermission", back_populates="role")
    assignments: Mapped[List["UserRoleAssignment"]] = relationship("UserRoleAssignment", back_populates="role")
    inheritance: Mapped[List["RoleInheritanceMap"]] = relationship("RoleInheritanceMap", foreign_keys="RoleInheritanceMap.parent_role_id", back_populates="parent_role")

class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(100), unique=True, index=True) # e.g. 'SESSIONS_CREATE'
    name: Mapped[str] = mapped_column(String(100))
    module: Mapped[str] = mapped_column(String(50)) # e.g. 'SESSIONS'
    description: Mapped[Optional[str]] = mapped_column(Text)

class RolePermission(Base):
    __tablename__ = "role_permissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"))
    permission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("permissions.id", ondelete="CASCADE"))
    
    role: Mapped["Role"] = relationship("Role", back_populates="permissions")
    permission: Mapped["Permission"] = relationship("Permission")

class UserRoleAssignment(Base):
    __tablename__ = "user_role_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=True)
    
    assigned_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    role: Mapped["Role"] = relationship("Role", back_populates="assignments")
    
    user: Mapped["User"] = relationship(
        "User", 
        back_populates="role_assignments",
        foreign_keys=[user_id]
    )
    
    assigner: Mapped["User"] = relationship(
        "User",
        foreign_keys=[assigned_by]
    )

class ScopedPermission(Base):
    __tablename__ = "scoped_permissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    permission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("permissions.id", ondelete="CASCADE"))
    scope_type: Mapped[str] = mapped_column(String(50)) # e.g. 'ORGANIZATION', 'EVENT', 'SESSION'
    scope_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    is_allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    
    user: Mapped["User"] = relationship(
        "User", 
        back_populates="scoped_permissions",
        foreign_keys=[user_id]
    )

    permission: Mapped["Permission"] = relationship("Permission")

class PermissionAuditLog(Base):
    __tablename__ = "permission_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    acting_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    target_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(100)) # e.g. 'ROLE_ASSIGNED', 'PERMISSION_TOGGLED'
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    old_values: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    new_values: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    request_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    correlation_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    actor: Mapped["User"] = relationship(
        "User",
        foreign_keys=[acting_user_id]
    )
    
    target: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[target_user_id]
    )

class UserAccessNode(Base):
    __tablename__ = "user_access_nodes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    node_type: Mapped[str] = mapped_column(String(50)) # e.g. 'EVENT', 'STATION', 'ROOM'
    node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    permissions: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship(
        "User", 
        back_populates="access_nodes",
        foreign_keys=[user_id]
    )

class AccessTemplate(Base):
    __tablename__ = "access_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(Text)
    config: Mapped[Dict[str, Any]] = mapped_column(JSONB) # Default permissions/roles for this template
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class RoleInheritanceMap(Base):
    __tablename__ = "role_inheritance_maps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"))
    child_role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"))

    parent_role: Mapped["Role"] = relationship("Role", foreign_keys=[parent_role_id], back_populates="inheritance")
    child_role: Mapped["Role"] = relationship("Role", foreign_keys=[child_role_id])
