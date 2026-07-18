variable "aws_region" {
  type        = string
  description = "AWS region for production."
  default     = "ap-south-1"
}

variable "cost_center" {
  type        = string
  description = "Cost allocation tag."
  default     = "eventx-production"
}

variable "vpc_cidr" {
  type        = string
  description = "Production VPC CIDR."
  default     = "10.50.0.0/16"
}

variable "deploy_application" {
  type    = bool
  default = false
}

variable "enable_services" {
  type    = bool
  default = false
}

variable "api_domain_name" {
  type    = string
  default = "api.example.com"
}

variable "speaker_portal_url" {
  type    = string
  default = "https://speaker.example.com"
}
variable "portal_origins" {
  type = set(string)
  default = [
    "https://command.example.com",
    "https://organiser.example.com",
    "https://register.example.com",
    "https://speaker.example.com",
  ]
}
variable "certificate_arn" {
  type    = string
  default = ""
}

variable "backend_image" {
  type    = string
  default = "public.ecr.aws/docker/library/python:3.12-slim"
}

variable "worker_image" {
  type    = string
  default = "public.ecr.aws/docker/library/python:3.12-slim"
}

variable "alert_email" {
  type    = string
  default = ""
}

variable "monthly_budget_usd" {
  type    = number
  default = 250
}

variable "public_demo_signup_enabled" {
  type    = bool
  default = false
}
