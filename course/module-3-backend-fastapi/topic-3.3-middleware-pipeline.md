# Module 3 - Topic 3.3: 11-Stage Production Middleware Pipeline

## 1. Introduction & Learning Objectives
Welcome to **Topic 3.3**. In this chapter, you will master the construction of an enterprise-grade 11-stage ASGI middleware pipeline in FastAPI ([services/backend/app/middleware](file:///d:/DEV/conf-platform/services/backend/app/middleware)).

### Learning Outcomes:
- Understand how ASGI middleware intercepts requests before route handlers execute.
- Implement rate limiting (**SlowAPI**), audit logging, and plan guards.
- Construct tenant context injection and IP allowlist enforcement middlewares.

---

## 2. The 11-Stage Middleware Pipeline Order

Every request passing into `services/backend` flows through 11 stages in exact sequence:

```
 1. Request Logging ──> 2. Security Headers ──> 3. Audit Logging ──> 4. Plan Guard ──>
 5. RBAC Enforcement ──> 6. App Guard ──> 7. Tenant Context ──> 8. Rate Limiter ──>
 9. IP Allowlist ──> 10. Auth Injector ──> 11. CORS Handling ──> Route Handler
```

---

## 3. Writing Custom ASGI Middleware in FastAPI

```python
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import time
import logging

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.time()
        
        # Extract headers & tenant ID
        tenant_id = request.headers.get("X-Tenant-ID", "public")
        
        # Proceed to next middleware or route handler
        response = await call_next(request)
        
        process_time = (time.time() - start_time) * 1000
        response.headers["X-Process-Time-MS"] = f"{process_time:.2f}"
        
        logging.info(f"[{tenant_id}] {request.method} {request.url.path} - Status: {response.status_code} ({process_time:.2f}ms)")
        return response
```

---

## 4. Rate Limiting with SlowAPI

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

---

## 5. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Implement a custom middleware `IPAllowlistMiddleware` that returns `403 Forbidden` if an IP is not present in an allowed list.
2. Verify that allowed IPs pass through while blocked IPs receive immediate HTTP 403 responses.

---

## 6. Chapter Summary & Next Steps
You have mastered multi-stage middleware engineering and request interception. Next, move to **[Topic 3.4: Authentication, JWT & RBAC Security](./topic-3.4-authentication-jwt-rbac.md)**.
