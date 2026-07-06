import uuid
from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict
class DesignTokenBase(BaseModel):
    name: str
    type: str
    value: str
class DesignTokenCreate(DesignTokenBase):
    pass
class DesignTokenOut(DesignTokenBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: Optional[uuid.UUID] = None
class ThemePresetBase(BaseModel):
    name: str
    description: Optional[str] = None
    settings: Dict[str, Any] = {}
class ThemePresetCreate(ThemePresetBase):
    pass
class ThemePresetOut(ThemePresetBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
class ComponentLibraryBase(BaseModel):
    component_name: str
    component_type: str
    schema_data: Dict[str, Any] = {}
class ComponentLibraryCreate(ComponentLibraryBase):
    pass
class ComponentLibraryOut(ComponentLibraryBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID