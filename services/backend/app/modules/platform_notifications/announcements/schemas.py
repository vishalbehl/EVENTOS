from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
import uuid

class AnnouncementsBase(BaseModel):
    pass

class AnnouncementsCreate(AnnouncementsBase):
    pass

class AnnouncementsResponse(AnnouncementsBase):
    id: uuid.UUID
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
