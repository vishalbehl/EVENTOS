import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict

class BlueprintStepBase(BaseModel):
    name: str
    step_order: int = 0
    settings: Dict[str, Any] = {}

class BlueprintStepCreate(BlueprintStepBase):
    pass

class BlueprintStepOut(BlueprintStepBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    blueprint_id: uuid.UUID

class EventBlueprintBase(BaseModel):
    name: str
    description: Optional[str] = None
    industry: str = "Technology"
    blueprint_data: Dict[str, Any] = {}
    is_system: bool = False
    is_active: bool = True

class EventBlueprintCreate(EventBlueprintBase):
    steps: List[Dict[str, Any]] = []

class EventBlueprintOut(EventBlueprintBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID

class BlueprintInstallationCreate(BaseModel):
    event_id: uuid.UUID
    blueprint_id: uuid.UUID

class BlueprintInstallationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID
    blueprint_id: uuid.UUID
    installed_at: datetime
