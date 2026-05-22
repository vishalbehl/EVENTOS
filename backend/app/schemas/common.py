# backend/app/schemas/common.py
from __future__ import annotations
from typing import Generic, List, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class MessageResponse(BaseModel):
    message: str


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int
