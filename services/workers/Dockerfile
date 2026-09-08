FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

# This image is built from the repository root. Legacy tasks use the shared
# backend model package for durable state, while keeping their own worker app
# and isolated queue namespace.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libmagic1 \
    libreoffice \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system app && useradd --system --gid app --home-dir /app app

WORKDIR /app

COPY services/backend/requirements.txt /tmp/backend-requirements.txt
RUN grep -v '^python-magic-bin' /tmp/backend-requirements.txt > /tmp/requirements-linux.txt \
    && pip install --no-cache-dir -r /tmp/requirements-linux.txt

COPY services/backend/app ./app
COPY services/workers ./workers
RUN chown -R app:app /app

USER app

CMD ["celery", "-A", "workers.celery_app:app", "worker", "--loglevel=INFO", "--queues=legacy-default,legacy-files,legacy-videos,legacy-imports,legacy-search,legacy-reports,legacy-reconciliation,legacy-notifications"]
