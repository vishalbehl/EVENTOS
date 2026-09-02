import uuid
from datetime import date
from decimal import Decimal
from typing import Any
from sqlalchemy import Date, Numeric, String, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class _ResourceModel(Base):
    __abstract__ = True
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    def __init__(self, **kwargs: Any) -> None:
        for key, value in kwargs.items():
            setattr(self, key, value)

def _model(name: str):
    return type(name, (_ResourceModel,), {"__tablename__": name.lower(), "__table_args__": {"schema": "resource_management"}, "__module__": __name__})


class ResourcePlan(_ResourceModel):
    __tablename__ = "resource_plans"
    __table_args__ = {"schema": "resource_management"}
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class StaffAssignment(_ResourceModel):
    __tablename__ = "staff_assignments"
    __table_args__ = {"schema": "resource_management"}
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    allocation_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)


class EquipmentAssignment(_ResourceModel):
    __tablename__ = "equipment_assignments"
    __table_args__ = {"schema": "resource_management"}
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    hardware_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)


class TravelPlan(_ResourceModel):
    __tablename__ = "travel_plans"
    __table_args__ = {"schema": "resource_management"}
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    hotel: Mapped[str | None] = mapped_column(String(150))
    arrival_date: Mapped[date] = mapped_column(Date, nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="PLANNED")

for _name in ("ResourceAllocation", "ResourceAvailability", "EmployeeCalendar", "EquipmentCalendar", "TravelBooking", "HotelBooking", "TransportBooking"):
    globals()[_name] = _model(_name)
