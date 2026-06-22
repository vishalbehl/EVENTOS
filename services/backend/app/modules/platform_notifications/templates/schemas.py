from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
import uuid

class TemplatesBase(BaseModel):
    pass

class TemplatesCreate(TemplatesBase):
    pass

class TemplatesResponse(TemplatesBase):
    id: uuid.UUID
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
