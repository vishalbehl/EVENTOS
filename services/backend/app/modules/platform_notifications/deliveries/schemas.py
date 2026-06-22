from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
import uuid

class DeliveriesBase(BaseModel):
    pass

class DeliveriesCreate(DeliveriesBase):
    pass

class DeliveriesResponse(DeliveriesBase):
    id: uuid.UUID
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
