# Module 3 - Topic 3.2: Domain-Driven Modular System Design & Router Aggregation

## 1. Introduction & Learning Objectives
Welcome to **Topic 3.2**. In this chapter, you will master Domain-Driven Modular Organization across 40+ domains in EventOS ([services/backend/app/modules](file:///d:/DEV/conf-platform/services/backend/app/modules)).

### Learning Outcomes:
- Organize codebase architecture into decoupled domain modules.
- Maintain clear separation of concerns (`routes`, `schemas`, `models`, `services`, `dependencies`).
- Aggregate domain routers into a centralized API gateway without circular dependency bugs.

---

## 2. Modular Architecture Directory Layout

```
services/backend/app/modules/
├── auth/           # Login, registration, token refresh
├── events/         # Event CRUD, schedules, rooms
├── speakers/       # Speaker profiles, slide decks
├── registration/   # Attendee ticketing, badge rendering
├── billing/        # Stripe payments, invoices
└── notifications/  # Email (Resend) & Socket.IO real-time alerts
```

Each module contains:
- `routes.py`: HTTP endpoint definitions.
- `schemas.py`: Pydantic v2 DTOs.
- `models.py`: SQLAlchemy ORM database models.
- `services.py`: Business logic & domain services.
- `dependencies.py`: Custom route dependencies.

---

## 3. Router Aggregation Pattern

In `app/routers/api.py`:

```python
from fastapi import APIRouter
from app.modules.auth.routes import router as auth_router
from app.modules.events.routes import router as events_router
from app.modules.speakers.routes import router as speakers_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(events_router)
api_router.include_router(speakers_router)
```

In `app/main.py`:
```python
app.include_router(api_router)
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Create a new domain module under `app/modules/sponsors/`.
2. Implement `routes.py`, `schemas.py`, `models.py`, and `services.py`.
3. Include the `sponsors_router` in `api_router` and verify it appears in Swagger docs (`/docs`).

---

## 5. Chapter Summary & Next Steps
You have mastered domain-driven modular microservice organization. Next, move to **[Topic 3.3: 11-Stage Production Middleware Pipeline](./topic-3.3-middleware-pipeline.md)**.
