import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

class AiChatRequestIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)

class AiCitation(BaseModel):
    entity_type: str
    entity_id: uuid.UUID
    title: str
    similarity: float

class AiChatResponseOut(BaseModel):
    message_id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    created_at: datetime
    citations: List[AiCitation] = []

class UsageStatsOut(BaseModel):
    model: str
    prompt_tokens: int
    completion_tokens: int
    estimated_cost_usd: float
