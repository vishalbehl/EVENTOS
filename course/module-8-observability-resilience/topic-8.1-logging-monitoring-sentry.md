# Module 8 - Topic 8.1: Full-Stack Observability, Structured Logging & Sentry Monitoring

## 1. Introduction & Learning Objectives
Welcome to **Topic 8.1**. In this chapter, you will master enterprise observability, JSON structured logging (`loguru`), error tracking with **Sentry**, and real-time metric collection with **Prometheus**.

### Learning Outcomes:
- Configure JSON structured logging with correlation IDs across microservice boundaries.
- Integrate Sentry exception tracking across Next.js frontends and FastAPI backends.
- Export metric telemetry (request latency, DB pool exhaustion) for Prometheus and Grafana.

---

## 2. Structured JSON Logging with `loguru`

```python
from loguru import logger
import sys

# Format logs as JSON for ELK / AWS CloudWatch aggregation
logger.remove()
logger.add(
    sys.stdout,
    format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {extra[tenant_id]} | {message}",
    serialize=True # Output in JSON format
)

def log_event_creation(tenant_id: str, event_id: str):
    logger.bind(tenant_id=tenant_id).info(f"Event created successfully: {event_id}")
```

---

## 3. Error Tracking Integration with Sentry

### 3.1 FastAPI Backend Integration
```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

sentry_sdk.init(
    dsn="https://example_sentry_dsn@sentry.io/123456",
    traces_sample_rate=0.2, # Sample 20% of transactions for distributed tracing
    integrations=[
        FastApiIntegration(),
        SqlalchemyIntegration(),
    ],
    environment="production"
)
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Intentionally raise an uncaught `ZeroDivisionError` in a FastAPI test endpoint.
2. Verify that Sentry SDK intercepts the exception, formats the stack trace, and sends a telemetry payload.

---

## 5. Chapter Summary & Next Steps
You have mastered full-stack observability, structured logging, and Sentry monitoring. Next, move to **[Topic 8.2: Load Testing & Disaster Recovery](./topic-8.2-load-testing-disaster-recovery.md)**.
