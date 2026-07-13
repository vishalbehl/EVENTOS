variable "project" {
  type        = string
  description = "Short project name used in resource names."
}

variable "environment" {
  type        = string
  description = "Deployment environment, for example nonprod or production."
}

variable "aws_region" {
  type        = string
  description = "AWS region for regional resources."
}

variable "cost_center" {
  type        = string
  description = "Cost allocation tag for FinOps reporting."
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention period."
  default     = 30
}

variable "ecr_repositories" {
  type        = set(string)
  description = "Container repositories to create."
  default     = ["backend", "workers", "venue-server"]
}

variable "storage_buckets" {
  type        = set(string)
  description = "Private object storage buckets required by the platform."
  default     = ["presentations", "posters", "thumbnails", "imports", "assets", "exports"]
}
