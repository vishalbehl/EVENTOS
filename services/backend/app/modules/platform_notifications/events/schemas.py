from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
import uuid

class EventsBase(BaseModel):
    pass

class EventsCreate(EventsBase):
    pass

class EventsResponse(EventsBase):
    id: uuid.UUID
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
