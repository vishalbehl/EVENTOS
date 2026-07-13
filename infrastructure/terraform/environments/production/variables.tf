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
