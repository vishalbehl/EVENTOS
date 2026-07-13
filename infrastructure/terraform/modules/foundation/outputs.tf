output "kms_key_arn" {
  value       = aws_kms_key.platform.arn
  description = "Platform KMS key ARN."
}

output "ecr_repository_urls" {
  value       = { for name, repo in aws_ecr_repository.service : name => repo.repository_url }
  description = "ECR repository URLs keyed by service name."
}

output "storage_bucket_names" {
  value       = { for name, bucket in aws_s3_bucket.storage : name => bucket.bucket }
  description = "Private storage bucket names keyed by bucket purpose."
}

output "log_group_names" {
  value       = { for name, group in aws_cloudwatch_log_group.service : name => group.name }
  description = "CloudWatch log group names keyed by service name."
}
