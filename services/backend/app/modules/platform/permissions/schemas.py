# app/modules/platform/permissions/schemas.py
import uuid
from typing import Optional
from pydantic import BaseModel, ConfigDict


class PermissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    module: str
    description: Optional[str] = None


class RolePermissionToggle(BaseModel):
    permission_id: uuid.UUID
