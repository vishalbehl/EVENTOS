output "vpc_id" {
  value       = aws_vpc.main.id
  description = "VPC ID."
}

output "public_subnet_ids" {
  value       = [for subnet in aws_subnet.public : subnet.id]
  description = "Public subnet IDs for load balancers."
}

output "private_runtime_subnet_ids" {
  value       = [for subnet in aws_subnet.private_runtime : subnet.id]
  description = "Private runtime subnet IDs for services and workers."
}

output "isolated_data_subnet_ids" {
  value       = [for subnet in aws_subnet.isolated_data : subnet.id]
  description = "Isolated data subnet IDs for databases and caches."
}
