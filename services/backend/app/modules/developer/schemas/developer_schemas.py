import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, HttpUrl

class ApiKeyIn(BaseModel):
    name: str
    expires_in_days: Optional[int] = None

class ApiKeyCreatedOut(BaseModel):
    id: uuid.UUID
    name: str
    prefix: str
    plaintext_key: str
    expires_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ApiKeyOut(BaseModel):
    id: uuid.UUID
    name: str
    prefix: str
    is_active: bool
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class OAuthClientIn(BaseModel):
    name: str
    redirect_uris: List[str]

class OAuthClientCreatedOut(BaseModel):
    id: uuid.UUID
    name: str
    client_id: str
    plaintext_client_secret: str
    redirect_uris: List[str]
    is_active: bool
    version: int
    created_at: datetime

    class Config:
        from_attributes = True

class OAuthClientOut(BaseModel):
    id: uuid.UUID
    name: str
    client_id: str
    redirect_uris: List[str]
    is_active: bool
    version: int
    revoked_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class OAuthTokenOut(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    refresh_token: Optional[str] = None
