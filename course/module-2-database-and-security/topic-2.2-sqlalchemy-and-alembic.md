# Module 2 - Topic 2.2: Async SQLAlchemy 2.0 ORM & Alembic Database Migrations

## 1. Introduction & Learning Objectives
Welcome to **Topic 2.2**. In this chapter, you will master asynchronous database access using **SQLAlchemy 2.0 Async ORM** and schema migration management with **Alembic** ([services/backend/alembic](file:///d:/DEV/conf-platform/services/backend/alembic)).

### Learning Outcomes:
- Define SQLAlchemy 2.0 declarative models with async mappings.
- Eliminate N+1 query performance bugs using `joinedload` and `selectinload`.
- Generate, inspect, and apply database migrations using Alembic.

---

## 2. SQLAlchemy 2.0 Declarative Async Models

In EventOS ([services/backend/app/modules/events/models.py](file:///d:/DEV/conf-platform/services/backend/app/modules/events/models.py)), models inherit from `Base`:

```python
from uuid import UUID, uuid4
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from app.core.database import Base

class EventModel(Base):
    __tablename__ = "events"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    sessions: Mapped[list["SessionModel"]] = relationship(back_populates="event", cascade="all, delete-orphan")
```

---

## 3. Asynchronous Querying & Eager Loading

### 3.1 Avoiding the N+1 Query Problem
Using basic `.relationship()` in async SQLAlchemy without eager loading will throw an `MissingGreenlet` exception. Always specify loading strategies:

```python
from sqlalchemy import select
from sqlalchemy.orm import selectinload, joinedload

async def get_event_with_sessions(db: AsyncSession, event_id: UUID) -> EventModel | None:
    stmt = (
        select(EventModel)
        .where(EventModel.id == event_id)
        .options(selectinload(EventModel.sessions)) # Eagerly fetch sessions in a single query
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
```

---

## 4. Alembic Migration Workflow

### 4.1 CLI Commands Overview
Inside `services/backend`:

```bash
# 1. Generate auto-migration from model changes
alembic revision --autogenerate -m "add metadata_json to events"

# 2. Inspect generated file under alembic/versions/

# 3. Apply migration to database
alembic upgrade head

# 4. Rollback last migration if needed
alembic downgrade -1
```

---

## 5. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Add a new column `is_published: Mapped[bool] = mapped_column(default=False)` to `EventModel`.
2. Run `alembic revision --autogenerate -m "add is_published flag"`.
3. Verify that the generated python migration script correctly specifies `op.add_column(...)`.

---

## 6. Chapter Summary & Next Steps
You have mastered async SQLAlchemy models, eager loading, and Alembic migrations. Next, move to **[Topic 2.3: Multi-Tenancy & Row-Level Security](./topic-2.3-multi-tenancy-and-rls.md)**.
