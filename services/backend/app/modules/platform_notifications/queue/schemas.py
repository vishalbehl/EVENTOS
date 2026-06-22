from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
import uuid

class QueueBase(BaseModel):
    pass

class QueueCreate(QueueBase):
    pass

class QueueResponse(QueueBase):
    id: uuid.UUID
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
