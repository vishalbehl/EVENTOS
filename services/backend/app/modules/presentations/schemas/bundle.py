import uuid
from datetime import datetime
from typing import List

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BundleFileCreate(BaseModel):
    file_id: uuid.UUID
    deck_order: int = Field(ge=0)
    is_primary: bool = False


class BundleCreate(BaseModel):
    session_speaker_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    chain_mode: str = Field(default="manual", pattern="^(manual|sequential)$")
    files: List[BundleFileCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_ordering(self) -> "BundleCreate":
        orders = [item.deck_order for item in self.files]
        if len(orders) != len(set(orders)):
            raise ValueError("deck_order values must be unique within a bundle")
        if sum(1 for item in self.files if item.is_primary) > 1:
            raise ValueError("only one file can be marked as primary")
        return self


class BundleFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    file_id: uuid.UUID
    deck_order: int
    is_primary: bool


class BundleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    session_speaker_id: uuid.UUID
    name: str
    chain_mode: str
    created_at: datetime
    updated_at: datetime
    files: List[BundleFileResponse]
