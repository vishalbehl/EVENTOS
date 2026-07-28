variable "aws_region" {
  type        = string
  description = "AWS region for non-production."
  default     = "ap-south-1"
}

variable "cost_center" {
  type        = string
  description = "Cost allocation tag."
  default     = "Event-nonprod"
}

variable "vpc_cidr" {
  type        = string
  description = "Non-production VPC CIDR."
  default     = "10.40.0.0/16"
}

variable "deploy_application" {
  type        = bool
  description = "Creates RDS, Redis, ALB, ECS, and runtime resources."
  default     = false
}

variable "enable_services" {
  type        = bool
  description = "Starts API and worker tasks after images and runtime secrets are configured."
  default     = false
}

variable "deletion_protection" {
  type        = bool
  description = "Protects the sample database and load balancer from accidental deletion."
  default     = true
}

variable "api_domain_name" {
  type        = string
  description = "Sample API hostname."
  default     = "api.sample.example.com"
}

variable "speaker_portal_url" {
  type        = string
  description = "Sample speaker portal URL."
  default     = "https://speaker.sample.example.com"
}

variable "portal_origins" {
  type        = set(string)
  description = "Exact Vercel/custom origins allowed by CORS and S3."
  default = [
    "https://command.sample.example.com",
    "https://organiser.sample.example.com",
    "https://register.sample.example.com",
    "https://speaker.sample.example.com",
  ]
}

variable "certificate_arn" {
  type        = string
  description = "Validated ACM certificate ARN for api_domain_name."
  default     = ""
}

variable "backend_image" {
  type        = string
  description = "Immutable backend ECR image URI."
  default     = "public.ecr.aws/docker/library/python:3.12-slim"
}

variable "worker_image" {
  type        = string
  description = "Immutable worker ECR image URI."
  default     = "public.ecr.aws/docker/library/python:3.12-slim"
}

variable "alert_email" {
  type        = string
  description = "Operations email for AWS budget and service alerts."
  default     = ""
}

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly sample environment budget."
  default     = 50
}

variable "public_demo_signup_enabled" {
  type        = bool
  description = "Enable only after signup abuse, verification, and cleanup gates pass."
  default     = false
}
