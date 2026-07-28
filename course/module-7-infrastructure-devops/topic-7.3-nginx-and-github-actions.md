# Module 7 - Topic 7.3: NGINX Reverse Proxy & Automated GitHub Actions CI/CD Pipelines

## 1. Introduction & Learning Objectives
Welcome to **Topic 7.3**. In this chapter, you will master traffic routing with **NGINX Reverse Proxies** and continuous deployment automation with **GitHub Actions** ([infrastructure/nginx](file:///d:/DEV/conf-platform/infrastructure/nginx) and [.github/workflows](file:///d:/DEV/conf-platform/.github/workflows)).

### Learning Outcomes:
- Configure NGINX reverse proxies for SSL termination, rate limiting, and path routing.
- Automate CI testing, Docker container builds, and deployment workflows.
- Deploy frontends to Vercel and backend container clusters to AWS ECS.

---

## 2. NGINX Reverse Proxy Configuration

In `infrastructure/nginx/nginx.conf`:

```nginx
events { worker_connections 1024; }

http {
    upstream backend_api {
        server backend:8000;
    }

    upstream socketio_gateway {
        server backend:8000;
    }

    server {
        listen 80;
        server_name api.eventos.io;

        location / {
            proxy_pass http://backend_api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # WebSocket & Socket.IO Upgrade Headers
        location /socket.io/ {
            proxy_pass http://socketio_gateway;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";
            proxy_set_header Host $host;
        }
    }
}
```

---

## 3. GitHub Actions CI/CD Pipeline

In [.github/workflows/aws-sample-deploy.yml](file:///d:/DEV/conf-platform/.github/workflows/aws-sample-deploy.yml):

```yaml
name: Production Deployment Pipeline

on:
  push:
    branches: [ main ]

jobs:
  test-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.13
        uses: actions/setup-python@v5
        with:
          python-version: "3.13"

      - name: Run Backend Pytest Suite
        run: |
          cd services/backend
          pip install -r requirements.txt
          pytest

      - name: Build & Push Docker Image to ECR
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/eventos-backend:$IMAGE_TAG services/backend
          docker push $ECR_REGISTRY/eventos-backend:$IMAGE_TAG

      - name: Deploy Task Definition to AWS ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: task-definition.json
          service: eventos-backend-service
          cluster: eventos-prod-cluster
          wait-for-service-stability: true
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Inspect `.github/workflows/vercel-portals-deploy.yml`.
2. Add a new workflow step that executes `npm run lint` inside `apps/cloud/command-center` before deploying.

---

## 5. Chapter Summary & Next Steps
You have completed Module 7! You have mastered Docker containerization, Docker Compose, Terraform IaC, NGINX reverse proxy routing, and GitHub Actions CI/CD pipelines. Next, move to **[Module 8 - Topic 8.1: Observability & Logging](../module-8-observability-resilience/topic-8.1-logging-monitoring-sentry.md)**.
