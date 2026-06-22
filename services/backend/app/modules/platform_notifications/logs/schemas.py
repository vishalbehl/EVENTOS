from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
import uuid

class LogsBase(BaseModel):
    pass

class LogsCreate(LogsBase):
    pass

class LogsResponse(LogsBase):
    id: uuid.UUID
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
