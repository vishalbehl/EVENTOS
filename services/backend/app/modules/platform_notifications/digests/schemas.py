from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
import uuid

class DigestsBase(BaseModel):
    pass

class DigestsCreate(DigestsBase):
    pass

class DigestsResponse(DigestsBase):
    id: uuid.UUID
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
