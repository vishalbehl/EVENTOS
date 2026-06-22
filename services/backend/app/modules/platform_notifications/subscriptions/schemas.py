from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
import uuid

class SubscriptionsBase(BaseModel):
    pass

class SubscriptionsCreate(SubscriptionsBase):
    pass

class SubscriptionsResponse(SubscriptionsBase):
    id: uuid.UUID
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
