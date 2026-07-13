variable "project" {
  type        = string
  description = "Short project name used in resource names."
}

variable "environment" {
  type        = string
  description = "Deployment environment."
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC."
}

variable "availability_zone_count" {
  type        = number
  description = "Number of availability zones to use."
  default     = 2
}

variable "cost_center" {
  type        = string
  description = "Cost allocation tag for FinOps reporting."
}
