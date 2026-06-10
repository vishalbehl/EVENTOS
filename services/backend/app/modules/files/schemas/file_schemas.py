import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

class AssetTagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    asset_id: uuid.UUID
    tag: str

class AssetVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    asset_id: uuid.UUID
    version_number: int
    file_path: str
    created_at: datetime

class AssetPermissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    asset_id: uuid.UUID
    user_id: uuid.UUID
    permission_type: str

class VirusScanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    asset_id: uuid.UUID
    status: str
    scan_result: Optional[str] = None
    scanned_at: datetime

class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    file_path: str
    file_size_bytes: int
    mime_type: str
    created_at: datetime
    versions: List[AssetVersionOut] = []
    tags: List[str] = []
    permissions: List[AssetPermissionOut] = []
    virus_scans: List[VirusScanOut] = []

class UploadSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    status: str
    created_at: datetime

class AddTagsRequest(BaseModel):
    tags: List[str] = Field(min_length=1, description="List of tags to associate with the asset")

class AssetPermissionCreate(BaseModel):
    user_id: uuid.UUID
    permission_type: str = Field(pattern="^(read|write|admin)$")
