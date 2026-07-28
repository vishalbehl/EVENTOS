# Module 7 - Topic 7.2: Infrastructure as Code (IaC) with Terraform & AWS Modules

## 1. Introduction & Learning Objectives
Welcome to **Topic 7.2**. In this chapter, you will master cloud infrastructure provisioning using **Terraform (IaC)** and **AWS Cloud Modules** (ECS Fargate, RDS PostgreSQL, ElastiCache Redis, S3 + CloudFront) ([infrastructure/terraform](file:///d:/DEV/conf-platform/infrastructure/terraform)).

### Learning Outcomes:
- Structure modular Terraform code bases across environments (`dev`, `staging`, `prod`).
- Manage remote state storage with S3 and DynamoDB state locking.
- Provision AWS ECS Fargate clusters, RDS PostgreSQL multi-AZ databases, and S3 CDN buckets.

---

## 2. Terraform Module Architecture

```
infrastructure/terraform/
├── environments/
│   ├── dev/main.tf
│   ├── staging/main.tf
│   └── prod/main.tf
└── modules/
    ├── ecs_fargate/   # ECS Cluster, Task Definitions, Auto-scaling
    ├── rds_postgres/  # Managed RDS PostgreSQL instance
    ├── elasticache/   # Redis Caching cluster
    └── s3_cloudfront/ # Media storage & global CDN distribution
```

---

## 3. Terraform Module Example: AWS ECS Fargate

In `infrastructure/terraform/modules/ecs_fargate/main.tf`:

```hcl
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}-cluster"
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.project_name}-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = "${var.ecr_repository_url}:latest"
      essential = true
      portMappings = [
        {
          containerPort = 8000
          hostPort      = 8000
        }
      ]
      environment = [
        { name = "ENVIRONMENT", value = var.environment }
      ]
    }
  ])
}

resource "aws_ecs_service" "backend" {
  name            = "${var.project_name}-backend-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }
}
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Navigate to `infrastructure/terraform`.
2. Execute `terraform init` and `terraform plan`.
3. Inspect the planned execution graph detailing resource creation.

---

## 5. Chapter Summary & Next Steps
You have mastered Terraform infrastructure provisioning on AWS. Next, move to **[Topic 7.3: NGINX & GitHub Actions CI/CD](./topic-7.3-nginx-and-github-actions.md)**.
