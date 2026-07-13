variable "aws_region" {
  type        = string
  description = "AWS region for non-production."
  default     = "ap-south-1"
}

variable "cost_center" {
  type        = string
  description = "Cost allocation tag."
  default     = "eventx-nonprod"
}

variable "vpc_cidr" {
  type        = string
  description = "Non-production VPC CIDR."
  default     = "10.40.0.0/16"
}
