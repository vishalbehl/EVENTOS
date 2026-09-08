data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project}-${var.environment}"
  common_tags = {
    Project     = var.project
    Environment = var.environment
    CostCenter  = var.cost_center
    ManagedBy   = "terraform"
  }
  api_url = "https://${var.api_domain_name}"

  storage_environment = [
    for key, bucket in var.storage_bucket_names : {
      name  = "S3_BUCKET_${upper(replace(key, "-", "_"))}"
      value = bucket
    }
  ]
}

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb"
  description = "Public HTTPS entry point"
  vpc_id      = var.vpc_id

  ingress {
    description      = "HTTPS"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  ingress {
    description      = "HTTP redirect"
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "runtime" {
  name        = "${local.name_prefix}-runtime"
  description = "ECS backend and worker tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "FastAPI from ALB only"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "database" {
  name        = "${local.name_prefix}-database"
  description = "PostgreSQL from ECS tasks only"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.runtime.id]
  }

  tags = local.common_tags
}

resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-redis"
  description = "Redis from ECS tasks only"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.runtime.id]
  }

  tags = local.common_tags
}

resource "aws_db_subnet_group" "main" {
  name       = local.name_prefix
  subnet_ids = var.data_subnet_ids
  tags       = local.common_tags
}

resource "aws_db_instance" "postgres" {
  identifier                      = "${local.name_prefix}-postgres"
  engine                          = "postgres"
  instance_class                  = var.database_instance_class
  allocated_storage               = var.database_allocated_storage
  max_allocated_storage           = max(var.database_allocated_storage * 2, 50)
  storage_type                    = "gp3"
  storage_encrypted               = true
  kms_key_id                      = var.kms_key_arn
  db_name                         = "Event"
  username                        = "Event_admin"
  manage_master_user_password     = true
  port                            = 5432
  db_subnet_group_name            = aws_db_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.database.id]
  publicly_accessible             = false
  multi_az                        = false
  backup_retention_period         = var.backup_retention_days
  backup_window                   = "18:00-19:00"
  maintenance_window              = "sun:19:30-sun:20:30"
  auto_minor_version_upgrade      = true
  deletion_protection             = var.deletion_protection
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${local.name_prefix}-final"
  copy_tags_to_snapshot           = true
  performance_insights_enabled    = false
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = local.common_tags
}

resource "aws_elasticache_subnet_group" "main" {
  name       = local.name_prefix
  subnet_ids = var.data_subnet_ids
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${local.name_prefix}-redis"
  description                = "Event cache and Celery broker"
  engine                     = "redis"
  node_type                  = var.redis_node_type
  port                       = 6379
  num_cache_clusters         = 1
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  automatic_failover_enabled = false
  multi_az_enabled           = false
  snapshot_retention_limit   = 1
  snapshot_window            = "17:00-18:00"
  maintenance_window         = "sun:20:30-sun:21:30"
  apply_immediately          = false

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "runtime" {
  name                    = "${local.name_prefix}/runtime"
  description             = "Runtime-only Event application secrets; populate before enabling ECS services"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = 7
  tags                    = local.common_tags
}

resource "aws_secretsmanager_secret" "deployment" {
  name                    = "${local.name_prefix}/deployment"
  description             = "Deployment-only database credentials; never mounted into API or worker tasks"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = 7
  tags                    = local.common_tags
}

resource "aws_secretsmanager_secret" "identity_bootstrap" {
  name                    = "${local.name_prefix}/identity-bootstrap"
  description             = "One-time super-admin bootstrap input and MFA enrollment output"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = 7
  tags                    = local.common_tags
}

resource "aws_ecs_cluster" "main" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.common_tags
}

resource "aws_iam_role" "execution" {
  name = "${local.name_prefix}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "runtime-secrets"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.runtime.arn,
          aws_secretsmanager_secret.deployment.arn,
          aws_secretsmanager_secret.identity_bootstrap.arn,
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [var.kms_key_arn]
      }
    ]
  })
}

resource "aws_iam_role" "task" {
  name = "${local.name_prefix}-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role_policy" "task" {
  name = "application-access"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "StorageBuckets"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = [for bucket in var.storage_bucket_names : "arn:aws:s3:::${bucket}"]
      },
      {
        Sid      = "StorageObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]
        Resource = [for bucket in var.storage_bucket_names : "arn:aws:s3:::${bucket}/*"]
      },
      {
        Sid      = "StorageEncryption"
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"]
        Resource = [var.kms_key_arn]
      },
      {
        Sid      = "DatabaseBootstrapSecret"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_db_instance.postgres.master_user_secret[0].secret_arn]
      },
      {
        Sid    = "DatabaseConnectionSecrets"
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue"]
        Resource = [
          aws_secretsmanager_secret.runtime.arn,
          aws_secretsmanager_secret.deployment.arn,
          aws_secretsmanager_secret.identity_bootstrap.arn,
        ]
      }
    ]
  })
}

resource "aws_lb" "api" {
  name                       = substr("${local.name_prefix}-api", 0, 32)
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = var.public_subnet_ids
  drop_invalid_header_fields = true
  enable_deletion_protection = var.deletion_protection
  idle_timeout               = 120
  tags                       = local.common_tags
}

resource "aws_lb_target_group" "backend" {
  name        = substr("${local.name_prefix}-backend", 0, 32)
  port        = 8000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    enabled             = true
    path                = "/ready"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 3600
    enabled         = true
  }

  tags = local.common_tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

locals {
  common_environment = concat([
    { name = "environment", value = "production" },
    { name = "API_BASE_URL", value = local.api_url },
    { name = "CORS_ORIGINS", value = join(",", var.cors_origins) },
    { name = "STORAGE_MODE", value = "s3" },
    { name = "S3_REGION", value = var.aws_region },
    { name = "S3_ENDPOINT_URL", value = "" },
    { name = "S3_PRESIGNED_EXPIRY_SECONDS", value = "300" },
    { name = "MAX_FILE_SIZE_MB", value = "25" },
    { name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/0?ssl_cert_reqs=required" },
    { name = "REDIS_CACHE_URL", value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/2?ssl_cert_reqs=required" },
    { name = "REDIS_LOCK_URL", value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/3?ssl_cert_reqs=required" },
    { name = "CELERY_BROKER_URL", value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/0?ssl_cert_reqs=required" },
    { name = "CELERY_RESULT_BACKEND", value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/1?ssl_cert_reqs=required" },
    { name = "REQUIRE_RLS_SAFE_RUNTIME_ROLE", value = "true" },
    { name = "ENFORCE_PRIVILEGED_MFA", value = "true" },
    { name = "ACCESS_TOKEN_EXPIRE_MINUTES", value = "60" },
    { name = "PUBLIC_DEMO_SIGNUP_ENABLED", value = tostring(var.public_demo_signup_enabled) },
    { name = "PUBLIC_DEMO_PLAN_NAME", value = "Basic" },
    { name = "PUBLIC_DEMO_RETENTION_DAYS", value = "14" },
    { name = "LOG_LEVEL", value = var.log_level }
  ], local.storage_environment)

  runtime_secret_keys = toset([
    "DATABASE_URL_SYNC",
    "DATABASE_URL_ASYNC",
    "JWT_SECRET_KEY",
    "PROPOSAL_SHARE_SECRET",
    "CLOUD_API_KEY",
    "FERNET_KEY",
    "PORTAL_JWT_SECRET",
    "PAYMENT_SECRET_KEY",
    "BACKEND_INTERNAL_API_KEY",
    "RESEND_API_KEY",
    "WHATSAPP_ACCESS_TOKEN"
  ])

  runtime_secrets = [
    for key in local.runtime_secret_keys : {
      name      = key
      valueFrom = "${aws_secretsmanager_secret.runtime.arn}:${key}::"
    }
  ]
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name_prefix}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name         = "backend"
    image        = var.backend_image
    essential    = true
    environment  = local.common_environment
    secrets      = local.runtime_secrets
    portMappings = [{ containerPort = 8000, hostPort = 8000, protocol = "tcp" }]
    healthCheck = {
      command     = ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)\""]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = var.log_group_names["backend"]
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name_prefix}-workers"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name        = "domain-worker"
      image       = var.backend_image
      essential   = true
      environment = local.common_environment
      secrets     = local.runtime_secrets
      command     = ["celery", "-A", "app.worker:celery_app", "worker", "--loglevel=${lower(var.log_level)}", "--queues=critical,default,notifications", "--concurrency=2"]
      stopTimeout = 120
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_names["workers"]
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "domain"
        }
      }
    },
    {
      name        = "application-processing-worker"
      image       = var.backend_image
      essential   = true
      environment = local.common_environment
      secrets     = local.runtime_secrets
      command     = ["celery", "-A", "app.worker:celery_app", "worker", "--loglevel=${lower(var.log_level)}", "--queues=files,videos,imports,search,reports,reconciliation", "--concurrency=1"]
      stopTimeout = 120
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_names["workers"]
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "application-processing"
        }
      }
    },
    {
      name      = "legacy-processing-worker"
      image     = var.worker_image
      essential = true
      environment = concat(local.common_environment, [
        { name = "BACKEND_WS_URL", value = local.api_url },
        { name = "UPLOAD_PORTAL_BASE_URL", value = var.speaker_portal_url }
      ])
      secrets     = local.runtime_secrets
      command     = ["celery", "-A", "workers.celery_app:app", "worker", "--loglevel=${lower(var.log_level)}", "--queues=legacy-default,legacy-files,legacy-videos,legacy-imports,legacy-notifications,legacy-reports,legacy-reconciliation,legacy-search", "--concurrency=1"]
      stopTimeout = 120
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_names["workers"]
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "legacy-processing"
        }
      }
    },
    {
      name        = "scheduler"
      image       = var.backend_image
      essential   = true
      environment = local.common_environment
      secrets     = local.runtime_secrets
      command     = ["celery", "-A", "app.worker:celery_app", "beat", "--loglevel=${lower(var.log_level)}"]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_names["workers"]
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "scheduler"
        }
      }
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "database_bootstrap" {
  family                   = "${local.name_prefix}-database-bootstrap"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "database-bootstrap"
    image     = var.backend_image
    essential = true
    command   = ["python", "ops/bootstrap_cloud_database.py"]
    environment = [
      { name = "DATABASE_ADMIN_SECRET_ARN", value = aws_db_instance.postgres.master_user_secret[0].secret_arn },
      { name = "DATABASE_HOST", value = aws_db_instance.postgres.address },
      { name = "DATABASE_PORT", value = tostring(aws_db_instance.postgres.port) },
      { name = "DATABASE_NAME", value = aws_db_instance.postgres.db_name },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "RUNTIME_SECRET_ARN", value = aws_secretsmanager_secret.runtime.arn },
      { name = "DEPLOYMENT_SECRET_ARN", value = aws_secretsmanager_secret.deployment.arn }
    ]
    secrets = [
      { name = "RUNTIME_DB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.deployment.arn}:RUNTIME_DB_PASSWORD::" },
      { name = "MIGRATION_DB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.deployment.arn}:MIGRATION_DB_PASSWORD::" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = var.log_group_names["backend"]
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "database-bootstrap"
      }
    }
  }])

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "migration" {
  family                   = "${local.name_prefix}-migration"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "migration"
    image     = var.backend_image
    essential = true
    command   = ["alembic", "upgrade", "head"]
    environment = [
      { name = "environment", value = "migration" }
    ]
    secrets = [
      { name = "DATABASE_URL_SYNC", valueFrom = "${aws_secretsmanager_secret.deployment.arn}:DATABASE_URL_SYNC::" },
      { name = "DATABASE_URL_ASYNC", valueFrom = "${aws_secretsmanager_secret.deployment.arn}:DATABASE_URL_ASYNC::" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = var.log_group_names["backend"]
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "migration"
      }
    }
  }])

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "identity_bootstrap" {
  family                   = "${local.name_prefix}-identity-bootstrap"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "identity-bootstrap"
    image     = var.backend_image
    essential = true
    command   = ["python", "ops/bootstrap_superadmin.py"]
    environment = [
      { name = "environment", value = "bootstrap" },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "IDENTITY_BOOTSTRAP_SECRET_ARN", value = aws_secretsmanager_secret.identity_bootstrap.arn }
    ]
    secrets = [
      { name = "DATABASE_URL_SYNC", valueFrom = "${aws_secretsmanager_secret.deployment.arn}:DATABASE_URL_SYNC::" },
      { name = "DATABASE_URL_ASYNC", valueFrom = "${aws_secretsmanager_secret.deployment.arn}:DATABASE_URL_ASYNC::" },
      { name = "FERNET_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:FERNET_KEY::" },
      { name = "BOOTSTRAP_SUPERADMIN_EMAIL", valueFrom = "${aws_secretsmanager_secret.identity_bootstrap.arn}:BOOTSTRAP_SUPERADMIN_EMAIL::" },
      { name = "BOOTSTRAP_SUPERADMIN_PASSWORD", valueFrom = "${aws_secretsmanager_secret.identity_bootstrap.arn}:BOOTSTRAP_SUPERADMIN_PASSWORD::" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = var.log_group_names["backend"]
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "identity-bootstrap"
      }
    }
  }])

  tags = local.common_tags
}

resource "aws_ecs_service" "backend" {
  name                               = "backend"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.backend.arn
  desired_count                      = var.enable_services ? var.backend_desired_count : 0
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 90
  enable_execute_command             = false

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [aws_security_group.runtime.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.https]
  tags       = local.common_tags

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }
}

resource "aws_ecs_service" "worker" {
  name                               = "workers"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.worker.arn
  desired_count                      = var.enable_services ? var.worker_desired_count : 0
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  enable_execute_command             = false

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [aws_security_group.runtime.id]
    assign_public_ip = true
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = local.common_tags

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }
}

resource "aws_appautoscaling_target" "backend" {
  max_capacity       = 3
  min_capacity       = var.enable_services ? 1 : 0
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "backend_cpu" {
  name               = "${local.name_prefix}-backend-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend.resource_id
  scalable_dimension = aws_appautoscaling_target.backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_sns_topic" "alerts" {
  name              = "${local.name_prefix}-alerts"
  kms_master_key_id = var.kms_key_arn
  tags              = local.common_tags
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "backend_unhealthy" {
  alarm_name          = "${local.name_prefix}-backend-unhealthy"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
    TargetGroup  = aws_lb_target_group.backend.arn_suffix
  }
  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "database_storage" {
  alarm_name          = "${local.name_prefix}-database-storage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 5368709120
  treat_missing_data  = "missing"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions          = { DBInstanceIdentifier = aws_db_instance.postgres.id }
  tags                = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${local.name_prefix}-redis-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 70
  treat_missing_data  = "missing"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions          = { ReplicationGroupId = aws_elasticache_replication_group.redis.id }
  tags                = local.common_tags
}

resource "aws_budgets_budget" "monthly" {
  name         = "${local.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = var.alert_email == "" ? [] : toset([50, 70, 85, 95])
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value >= 85 ? "FORECASTED" : "ACTUAL"
      subscriber_email_addresses = [var.alert_email]
    }
  }

  tags = local.common_tags
}
