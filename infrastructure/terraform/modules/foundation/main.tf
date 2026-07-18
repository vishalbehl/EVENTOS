locals {
  name_prefix = "${var.project}-${var.environment}"

  common_tags = {
    Project     = var.project
    Environment = var.environment
    CostCenter  = var.cost_center
    ManagedBy   = "terraform"
  }
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "kms" {
  statement {
    sid    = "EnableAccountIAMPolicies"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    actions   = ["kms:*"]
    resources = ["*"]
  }

  statement {
    sid    = "AllowCloudWatchLogs"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["logs.${var.aws_region}.amazonaws.com"]
    }

    actions = [
      "kms:Encrypt*",
      "kms:Decrypt*",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:Describe*",
    ]
    resources = ["*"]

    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/${var.project}/${var.environment}/*"]
    }
  }

  statement {
    sid    = "AllowSNS"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }

    actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]
  }
}

resource "aws_kms_key" "platform" {
  description             = "${local.name_prefix} platform encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.kms.json

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

resource "aws_s3_bucket_ownership_controls" "storage" {
  for_each = aws_s3_bucket.storage

  bucket = each.value.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_cors_configuration" "storage" {
  for_each = length(var.storage_cors_origins) > 0 ? aws_s3_bucket.storage : {}

  bucket = each.value.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT", "POST"]
    allowed_origins = sort(tolist(var.storage_cors_origins))
    expose_headers  = ["ETag", "x-amz-checksum-sha256", "x-amz-request-id"]
    max_age_seconds = 300
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "storage" {
  for_each = aws_s3_bucket.storage

  bucket = each.value.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  dynamic "rule" {
    for_each = contains(["imports", "exports"], each.key) ? [each.key] : []
    content {
      id     = "expire-temporary-${rule.value}"
      status = "Enabled"

      filter {
        prefix = "temporary/"
      }

      expiration {
        days = var.temporary_object_retention_days
      }

      noncurrent_version_expiration {
        noncurrent_days = var.temporary_object_retention_days
      }
    }
  }
}

data "aws_iam_policy_document" "storage" {
  for_each = aws_s3_bucket.storage

  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]
    resources = [
      each.value.arn,
      "${each.value.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "storage" {
  for_each = aws_s3_bucket.storage

  bucket = each.value.id
  policy = data.aws_iam_policy_document.storage[each.key].json
}
