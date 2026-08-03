from typing import Any, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from datetime import datetime

class EmailAssetBase(BaseModel):
    name: str
    url: str
    file_type: str
    size_bytes: int

class EmailAssetCreate(EmailAssetBase):
    pass

class EmailAssetResponse(EmailAssetBase):
    id: uuid.UUID
    scope_type: str = "EVENT"
    organization_id: Optional[uuid.UUID] = None
    event_id: Optional[uuid.UUID] = None
    user_id: uuid.UUID
    asset_kind: str = "IMAGE"
    source_type: str = "UPLOAD"
    source_url: Optional[str] = None
    folder_id: Optional[uuid.UUID] = None
    tags: list[str] = Field(default_factory=list)
    width: Optional[int] = None
    height: Optional[int] = None
    checksum: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="asset_metadata")
    version: int = 1
    editable: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class EmailBrandingPolicyResponse(BaseModel):
    enabled: bool = True
    text: str = "In collaboration with EventOS"
    icon_url: Optional[HttpUrl] = None
    destination_url: Optional[HttpUrl] = None
    version: int = 1
    editable: bool = False


class EmailBrandingPolicyUpdate(BaseModel):
    enabled: bool
    text: str = Field(min_length=2, max_length=160)
    icon_url: Optional[HttpUrl] = None
    destination_url: Optional[HttpUrl] = None
    reason: str = Field(min_length=12, max_length=1000)
