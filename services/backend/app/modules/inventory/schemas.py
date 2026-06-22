import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

# Hardware Category
class HardwareCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None

class HardwareCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: Optional[str]

# Hardware Item
class HardwareItemCreate(BaseModel):
    category_id: uuid.UUID
    asset_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=150)
    brand: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=100)
    serial_number: str = Field(min_length=1, max_length=100)
    purchase_date: Optional[datetime] = None
    purchase_cost: float = Field(default=0.0, ge=0.0)
    replacement_cost: float = Field(default=0.0, ge=0.0)
    status: str = "AVAILABLE"
    condition: str = "GOOD"
    location: Optional[str] = None
    notes: Optional[str] = None

class HardwareItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: Optional[uuid.UUID]
    category_id: uuid.UUID
    asset_code: str
    name: str
    brand: str
    model: str
    serial_number: str
    purchase_date: Optional[datetime]
    purchase_cost: float
    replacement_cost: float
    status: str
    condition: str
    location: Optional[str]
    notes: Optional[str]

# Hardware Stock
class HardwareStockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    hardware_id: uuid.UUID
    quantity: int
    reserved_quantity: int
    available_quantity: int

# Hardware Movement (logs assignments, returns, damage, etc.)
class HardwareMovementCreate(BaseModel):
    hardware_id: uuid.UUID
    type: str = Field(min_length=1, max_length=50)
    quantity: int = Field(default=1, ge=1)
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    notes: Optional[str] = None

class HardwareMovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: Optional[uuid.UUID]
    hardware_id: uuid.UUID
    type: str
    quantity: int
    from_location: Optional[str]
    to_location: Optional[str]
    notes: Optional[str]
    created_at: datetime

# Hardware Maintenance
class HardwareMaintenanceCreate(BaseModel):
    hardware_id: uuid.UUID
    maintenance_date: Optional[datetime] = None
    vendor: str = Field(min_length=1, max_length=150)
    cost: float = Field(default=0.0, ge=0.0)
    description: Optional[str] = None

class HardwareMaintenanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    hardware_id: uuid.UUID
    maintenance_date: datetime
    vendor: str
    cost: float
    description: Optional[str]

# Allocation/Return specific payloads
class AllocateHardwareRequest(BaseModel):
    hardware_id: uuid.UUID
    to_location: str = Field(min_length=1, max_length=100)
    notes: Optional[str] = None

class ReturnHardwareRequest(BaseModel):
    hardware_id: uuid.UUID
    return_location: str = Field(min_length=1, max_length=100)
    condition: Optional[str] = None
    notes: Optional[str] = None
