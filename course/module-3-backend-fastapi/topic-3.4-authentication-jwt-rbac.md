# Module 3 - Topic 3.4: Authentication, JWT Token Management & RBAC Security

## 1. Introduction & Learning Objectives
Welcome to **Topic 3.4**. In this chapter, you will master enterprise authentication, JWT access/refresh token rotation, OAuth2 bearer flows, and Role-Based Access Control (RBAC) security ([services/backend/app/modules/auth](file:///d:/DEV/conf-platform/services/backend/app/modules/auth)).

### Learning Outcomes:
- Sign and verify short-lived access tokens (8h) and long-lived refresh tokens (30 days).
- Implement token revoking and blacklisting via Redis.
- Enforce role-based access control (RBAC) scopes across protected API routes.

---

## 2. JWT Generation & Token Verification

```python
from datetime import datetime, timedelta
import jwt
from app.core.config import settings

SECRET_KEY = settings.JWT_SECRET_KEY # e.g. HS256 secret
ALGORITHM = "HS256"

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=8))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

---

## 3. Role-Based Access Control (RBAC) Dependencies

```python
from fastapi import Security
from fastapi.security import SecurityScopes

class PermissionChecker:
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: UserModel = Depends(get_current_user)):
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User role '{current_user.role}' lacks required permissions"
            )
        return current_user

# Route Protection Example
require_admin = PermissionChecker(allowed_roles=["SuperAdmin", "Organiser"])

@router.delete("/events/{event_id}", dependencies=[Depends(require_admin)])
async def delete_event(event_id: UUID):
    return {"message": "Event deleted successfully"}
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Issue a JWT token with role `"Attendee"`.
2. Send a request to an endpoint guarded by `require_admin` and verify HTTP 403 Forbidden is returned.
3. Re-issue token with role `"Organiser"` and verify HTTP 200 OK.

---

## 5. Chapter Summary & Next Steps
You have completed Module 3! You have mastered FastAPI core routing, Pydantic v2 schemas, modular architecture, 11-stage middleware pipelines, JWT auth, and RBAC security. Next, move to **[Module 4 - Topic 4.1: Distributed Task Queues with Celery & Redis](../module-4-async-media-websockets/topic-4.1-celery-and-redis.md)**.
