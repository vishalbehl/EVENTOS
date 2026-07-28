# Module 3 - Topic 3.1: FastAPI Core, Pydantic v2 & Dependency Injection Graph

## 1. Introduction & Learning Objectives
Welcome to **Topic 3.1**. In this chapter, you will master backend microservice development using **FastAPI** and **Pydantic v2** validation engines ([services/backend/app](file:///d:/DEV/conf-platform/services/backend/app)).

### Learning Outcomes:
- Design bulletproof Pydantic v2 input/output schemas with custom validators.
- Leverage FastAPI Dependency Injection (`Depends`) for authentication and DB sessions.
- Build auto-documenting REST APIs with OpenAPI specifications.

---

## 2. Pydantic v2 Schema Engineering

In EventOS ([services/backend/app/modules/events/schemas.py](file:///d:/DEV/conf-platform/services/backend/app/modules/events/schemas.py)):

```python
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from uuid import UUID

class EventBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=255, example="Annual Tech Summit 2026")
    slug: str = Field(..., min_length=3, max_length=100, example="annual-tech-summit-2026")

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        if not v.islower() or " " in v:
            raise ValueError("Slug must be lowercase and hyphen-separated without spaces")
        return v

class EventCreate(EventBase):
    tenant_id: str

class EventResponse(EventBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True # Enables Pydantic to read ORM model objects
```

---

## 3. Dependency Injection Graph (`Depends`)

FastAPI's dependency injection system resolves dependencies hierarchically:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db

router = APIRouter(prefix="/events", tags=["Events"])

@router.post("/", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    db: AsyncSession = Depends(get_db)
):
    # Payload is automatically validated before reaching this line
    new_event = EventModel(**payload.model_dump())
    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)
    return new_event
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Add a `@field_validator("start_date")` ensuring `start_date` is in the future.
2. Test payload validation errors by sending invalid dates via FastAPI Swagger UI at `http://127.0.0.1:8000/docs`.

---

## 5. Chapter Summary & Next Steps
You have mastered FastAPI routing, Pydantic v2 schemas, and dependency injection. Next, move to **[Topic 3.2: Domain-Driven Modular System Design](./topic-3.2-domain-driven-design.md)**.
