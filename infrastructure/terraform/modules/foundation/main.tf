locals {
  name_prefix = "${var.project}-${var.environment}"

  common_tags = {
    Project     = var.project
    Environment = var.environment
    CostCenter  = var.cost_center
    ManagedBy   = "terraform"
  }
}

resource "aws_kms_key" "platform" {
  description             = "${local.name_prefix} platform encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = local.common_tags
}

resource "aws_kms_alias" "platform" {
  name          = "alias/${local.name_prefix}-platform"
  target_key_id = aws_kms_key.platform.key_id
}

resource "aws_cloudwatch_log_group" "service" {
  for_each = toset(["backend", "workers", "venue-server"])

  name              = "/${var.project}/${var.environment}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.platform.arn

  tags = local.common_tags
}

resource "aws_ecr_repository" "service" {
  for_each = var.ecr_repositories

  name                 = "${local.name_prefix}/${each.key}"
  image_tag_mutability = "IMMUTABLE"

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.platform.arn
  }

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_s3_bucket" "storage" {
  for_each = var.storage_buckets

  bucket = "${local.name_prefix}-${each.key}"

  tags = merge(local.common_tags, {
    DataPlane = "operational"
  })
}

resource "aws_s3_bucket_public_access_block" "storage" {
  for_each = aws_s3_bucket.storage

  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "storage" {
  for_each = aws_s3_bucket.storage

  bucket = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.platform.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_versioning" "storage" {
  for_each = aws_s3_bucket.storage

  bucket = each.value.id

  versioning_configuration {
    status = "Enabled"
  }
}
