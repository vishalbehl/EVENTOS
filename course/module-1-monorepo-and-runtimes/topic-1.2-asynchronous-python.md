# Module 1 - Topic 1.2: Modern Asynchronous Python 3.13+ Engineering

## 1. Introduction & Learning Objectives
Welcome to **Topic 1.2**. In this chapter, you will master modern Python 3.13 features, strict type hinting with `typing` and `Annotated`, package management (`uv` / `pip`), and asynchronous programming pattern implementation in FastAPI ([services/backend](file:///d:/DEV/conf-platform/services/backend)).

### Learning Outcomes:
- Write robust Python 3.13 code leveraging strict type annotations.
- Understand async context managers (`async with`) and async generators (`async for`).
- Manage dependencies cleanly using virtual environments and `requirements.txt`.

---

## 2. Strict Type Annotations & Static Analysis

### 2.1 Typing Primitives in Python 3.13
Modern Python eliminates legacy `typing.List` / `typing.Dict` in favor of native generic types:
```python
from typing import Annotated, Optional, AsyncGenerator
from pydantic import BaseModel, Field

# Python 3.13 Native Generics
def process_event_ids(event_ids: list[str]) -> dict[str, bool]:
    return {eid: True for eid in event_ids}

# Using Annotated for metadata injection
TenantId = Annotated[str, Field(min_length=3, max_length=50, description="Tenant Slug")]
```

### 2.2 Static Type Checking with `mypy`
Running `mypy app` inside `services/backend` enforces strict type checking before deployment:
```bash
mypy --strict --ignore-missing-imports app
```

---

## 3. Asynchronous Context Managers & Generators

### 3.1 Async Database Session Lifecycle
In `services/backend/app/core/database.py`, database sessions are managed via async context managers:

```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

engine = create_async_engine("postgresql+asyncpg://user:pass@localhost/db", echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

---

## 4. Practical Exercise & Self-Assessment

### Exercise:
1. Open `services/backend/requirements.txt`.
2. Locate core dependencies (`fastapi`, `sqlalchemy`, `pydantic`, `asyncpg`, `celery`).
3. Write an async Python script using `httpx.AsyncClient` that queries an external API and yields data using `AsyncGenerator`.

---

## 5. Chapter Summary & Next Steps
You have mastered modern Python 3.13 typing, async context managers, and DB session life cycles. Next, move to **[Topic 1.3: Monorepo Engineering](./topic-1.3-monorepo-engineering.md)**.
