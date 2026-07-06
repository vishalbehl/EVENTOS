import uuid
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict

class ThemeAssetBase(BaseModel):
    asset_url: str
    asset_type: str

class ThemeAssetCreate(ThemeAssetBase):
    pass

class ThemeAssetOut(ThemeAssetBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    theme_id: uuid.UUID

class ThemeBase(BaseModel):
    name: str
    description: Optional[str] = None
    theme_data: Dict[str, Any] = {}

class ThemeCreate(ThemeBase):
    assets: List[ThemeAssetCreate] = []

class ThemeOut(ThemeBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: Optional[uuid.UUID] = None
