from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
import uuid

class WebhooksBase(BaseModel):
    pass

class WebhooksCreate(WebhooksBase):
    pass

class WebhooksResponse(WebhooksBase):
    id: uuid.UUID
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
