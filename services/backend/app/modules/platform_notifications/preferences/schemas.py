from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
import uuid

class PreferencesBase(BaseModel):
    pass

class PreferencesCreate(PreferencesBase):
    pass

class PreferencesResponse(PreferencesBase):
    id: uuid.UUID
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
