# Module 4 - Topic 4.1: Distributed Task Queues with Celery 5.4 & Redis 7

## 1. Introduction & Learning Objectives
Welcome to **Topic 4.1**. In this chapter, you will master distributed asynchronous task execution using **Celery 5.4** and **Redis 7** message brokers ([services/workers](file:///d:/DEV/conf-platform/services/workers)).

### Learning Outcomes:
- Configure Celery app instances, task brokers, and result backends.
- Understand task signature primitives (`chain`, `group`, `chord`).
- Implement automated retries with exponential backoff for background jobs.

---

## 2. Celery Architecture & Task Definition

In EventOS, heavy CPU tasks (slide validation, PDF generation, video transcoding) are offloaded to Celery workers:

```python
from celery import Celery
import os

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "eventos_workers",
    broker=redis_url,
    backend=redis_url
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True, # Task acknowledged after execution completes
    worker_prefetch_multiplier=1 # Fair task distribution across workers
)

@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def process_presentation_slide(self, slide_id: str):
    try:
        # Perform heavy processing
        print(f"Processing slide: {slide_id}")
        return {"status": "SUCCESS", "slide_id": slide_id}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
```

---

## 3. Launching Celery Workers

Inside `services/backend`:
```bash
python -m celery -A app.worker worker --loglevel=info -P solo
```

Triggering background task from FastAPI:
```python
from app.worker import process_presentation_slide

@router.post("/slides/{slide_id}/process")
async def trigger_slide_processing(slide_id: str):
    # Enqueue task to Redis asynchronously
    task = process_presentation_slide.delay(slide_id)
    return {"task_id": task.id, "status": "QUEUED"}
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Start Redis locally (`redis-server`).
2. Trigger `process_presentation_slide.delay("slide_123")` from Python REPL.
3. Inspect Celery worker logs and verify task completion output.

---

## 5. Chapter Summary & Next Steps
You have mastered distributed task queues with Celery and Redis. Next, move to **[Topic 4.2: FFmpeg & Document Pipelines](./topic-4.2-document-and-ffmpeg-pipelines.md)**.
