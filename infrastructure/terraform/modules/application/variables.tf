variable "project" { type = string }
variable "environment" { type = string }
variable "aws_region" { type = string }
variable "cost_center" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "data_subnet_ids" { type = list(string) }
variable "kms_key_arn" { type = string }
variable "log_group_names" { type = map(string) }
variable "storage_bucket_names" { type = map(string) }

variable "api_domain_name" {
  type        = string
  description = "Public API hostname used by FastAPI and portal clients."
}

variable "certificate_arn" {
  type        = string
  description = "Validated ACM certificate ARN for the API hostname."
}

variable "cors_origins" {
  type        = list(string)
  description = "Exact Vercel and custom portal origins."
}

variable "backend_image" {
  type        = string
  description = "Immutable backend ECR image URI, preferably pinned by digest."
}

variable "worker_image" {
  type        = string
  description = "Immutable worker ECR image URI, preferably pinned by digest."
}

variable "enable_services" {
  type        = bool
  description = "Starts ECS services only after runtime secret values and images are ready."
  default     = false
}

variable "speaker_portal_url" {
  type        = string
  description = "Public speaker portal URL used in worker-generated links."
}

variable "backend_desired_count" {
  type    = number
  default = 1
}

variable "worker_desired_count" {
  type    = number
  default = 1
}

variable "backend_cpu" {
  type    = number
  default = 512
}

variable "backend_memory" {
  type    = number
  default = 1024
}

variable "worker_cpu" {
  type    = number
  default = 1024
}

variable "worker_memory" {
  type    = number
  default = 2048
}

variable "database_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "database_allocated_storage" {
  type    = number
  default = 20
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "log_level" {
  type    = string
  default = "INFO"
}

variable "alert_email" {
  type    = string
  default = ""
}

variable "public_demo_signup_enabled" {
  type        = bool
  description = "Enables capped public organization signup only after abuse controls pass."
  default     = false
}

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly sample-environment budget used for alerts."
  default     = 50
}
