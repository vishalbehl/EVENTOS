import uuid
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

# Vendor Service Mapping
class VendorServiceCreate(BaseModel):
    vendor_id: uuid.UUID
    service_id: uuid.UUID
    cost: float = Field(ge=0.0)

class VendorServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    vendor_id: uuid.UUID
    service_id: uuid.UUID
    cost: float

# Vendor Profile
class VendorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    type: str = Field(min_length=1, max_length=50) # hardware, services, catering
    country: str = Field(min_length=1, max_length=100)
    city: str = Field(min_length=1, max_length=100)
    contact_person: Optional[str] = None
    email: str = Field(min_length=1, max_length=100)
    phone: Optional[str] = None
    gst_number: Optional[str] = None
    rating: float = Field(default=5.0, ge=0.0, le=5.0)
    status: str = "ACTIVE"

class VendorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    type: str
    country: str
    city: str
    contact_person: Optional[str]
    email: str
    phone: Optional[str]
    gst_number: Optional[str]
    rating: float
    status: str

# Vendor Compare Out
class VendorCompareItem(BaseModel):
    vendor_id: uuid.UUID
    vendor_name: str
    type: str
    rating: float
    cost: float
    email: str
    contact_person: Optional[str]
