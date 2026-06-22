import uuid
from datetime import date, datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, ForeignKey, Index, Numeric, Integer, Date, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class ResourcePlan(Base):
    __tablename__ = "resource_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project", back_populates="resource_plans")

class ResourceAllocation(Base):
    __tablename__ = "resource_allocations"
    __table_args__ = (
        Index("idx_resource_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False) # e.g. STAFF, EQUIPMENT, THIRD_PARTY
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="PROPOSED", index=True) # PROPOSED, ALLOCATED, RELEASED, CONFLICT

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project", back_populates="allocations")

class StaffAssignment(Base):
    __tablename__ = "staff_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("commercial.staff_roles.id", ondelete="RESTRICT"), nullable=False)
    allocation_percentage: Mapped[float] = mapped_column(Numeric(5, 2), default=100.0)
    hours_allocated: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project", back_populates="staff_assignments")
    employee: Mapped["app.modules.identity.models.user.User"] = relationship("User")
    role: Mapped["app.modules.commercial.models.StaffRole"] = relationship("StaffRole")

class EquipmentAssignment(Base):
    __tablename__ = "equipment_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    hardware_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory.hardware_items.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project", back_populates="equipment_assignments")
    hardware: Mapped["app.modules.inventory.models.HardwareItem"] = relationship("HardwareItem")

class TravelPlan(Base):
    __tablename__ = "travel_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operations_planning.projects.id", ondelete="CASCADE"), nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    hotel: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    arrival_date: Mapped[date] = mapped_column(Date, nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="PLANNED") # PLANNED, BOOKED, COMPLETED, CANCELLED

    project: Mapped["app.modules.operations_planning.models.Project"] = relationship("Project", back_populates="travel_plans")
    employee: Mapped["app.modules.identity.models.user.User"] = relationship("User")
    travel_bookings: Mapped[List["TravelBooking"]] = relationship("TravelBooking", back_populates="travel_plan", cascade="all, delete-orphan")
    hotel_bookings: Mapped[List["HotelBooking"]] = relationship("HotelBooking", back_populates="travel_plan", cascade="all, delete-orphan")
    transport_bookings: Mapped[List["TransportBooking"]] = relationship("TransportBooking", back_populates="travel_plan", cascade="all, delete-orphan")

class ResourceAvailability(Base):
    __tablename__ = "resource_availability"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False) # STAFF, EQUIPMENT
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

class EmployeeCalendar(Base):
    __tablename__ = "employee_calendars"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    allocated_hours: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="SET NULL"), nullable=True)

    employee: Mapped["app.modules.identity.models.user.User"] = relationship("User")

class EquipmentCalendar(Base):
    __tablename__ = "equipment_calendars"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hardware_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory.hardware_items.id", ondelete="CASCADE"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    allocated_quantity: Mapped[int] = mapped_column(Integer, default=0)
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="SET NULL"), nullable=True)

    hardware: Mapped["app.modules.inventory.models.HardwareItem"] = relationship("HardwareItem")

class TravelBooking(Base):
    __tablename__ = "travel_bookings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    travel_plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("resource_management.travel_plans.id", ondelete="CASCADE"), nullable=False)
    vendor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    booking_reference: Mapped[str] = mapped_column(String(100), nullable=False)
    booking_status: Mapped[str] = mapped_column(String(50), default="CONFIRMED")
    cost: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)

    travel_plan: Mapped["TravelPlan"] = relationship("TravelPlan", back_populates="travel_bookings")

class HotelBooking(Base):
    __tablename__ = "hotel_bookings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    travel_plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("resource_management.travel_plans.id", ondelete="CASCADE"), nullable=False)
    hotel_name: Mapped[str] = mapped_column(String(255), nullable=False)
    room_type: Mapped[str] = mapped_column(String(100), nullable=False)
    check_in: Mapped[date] = mapped_column(Date, nullable=False)
    check_out: Mapped[date] = mapped_column(Date, nullable=False)
    cost: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)

    travel_plan: Mapped["TravelPlan"] = relationship("TravelPlan", back_populates="hotel_bookings")

class TransportBooking(Base):
    __tablename__ = "transport_bookings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    travel_plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("resource_management.travel_plans.id", ondelete="CASCADE"), nullable=False)
    transport_type: Mapped[str] = mapped_column(String(50), nullable=False)
    carrier: Mapped[str] = mapped_column(String(100), nullable=False)
    departure_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    arrival_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cost: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)

    travel_plan: Mapped["TravelPlan"] = relationship("TravelPlan", back_populates="transport_bookings")
