# Module 7 - Topic 7.1: Multi-Stage Production Dockerfiles & Docker Compose Orchestration

## 1. Introduction & Learning Objectives
Welcome to **Topic 7.1**. In this chapter, you will master production containerization using **Docker**, multi-stage build optimization, layer caching, and local multi-container orchestration with **Docker Compose** ([infrastructure/docker](file:///d:/DEV/conf-platform/infrastructure/docker) and [docker-compose.yml](file:///d:/DEV/conf-platform/docker-compose.yml)).

### Learning Outcomes:
- Write optimized, security-hardened multi-stage `Dockerfile`s producing images under 150MB.
- Configure non-root security users and multi-stage build cache layers.
- Orchestrate multi-container microservice environments using Docker Compose.

---

## 2. Multi-Stage Production Dockerfile Engineering

In `services/backend/Dockerfile`:

```dockerfile
# ----------------------------------------------------
# Stage 1: Build & Dependencies Installation
# ----------------------------------------------------
FROM python:3.13-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ----------------------------------------------------
# Stage 2: Minimal Production Runtime
# ----------------------------------------------------
FROM python:3.13-slim AS runner

WORKDIR /app

# Security: Create non-root app user
RUN useradd -m -u 1001 appuser

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy installed python dependencies from builder stage
COPY --from=builder /install /usr/local
COPY . /app

USER appuser

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 3. Production Docker Compose Orchestration

In [docker-compose.yml](file:///d:/DEV/conf-platform/docker-compose.yml):

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: eventos_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secretpassword
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build:
      context: ./services/backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:secretpassword@postgres:5432/eventos_db
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - postgres
      - redis

volumes:
  pgdata:
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Build the backend image: `docker build -t eventos-backend:v1 services/backend`.
2. Inspect image size using `docker images` and verify it remains lightweight (< 150MB).
3. Spin up environment: `docker-compose up -d`.

---

## 5. Chapter Summary & Next Steps
You have mastered Docker containerization and Docker Compose orchestration. Next, move to **[Topic 7.2: Infrastructure as Code with Terraform & AWS](./topic-7.2-terraform-aws-modules.md)**.
