data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix = "${var.project}-${var.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, var.availability_zone_count)

  common_tags = {
    Project     = var.project
    Environment = var.environment
    CostCenter  = var.cost_center
    ManagedBy   = "terraform"
  }
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-vpc"
  })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-igw"
  })
}

resource "aws_subnet" "public" {
  for_each = { for index, az in local.azs : az => index }

  vpc_id                  = aws_vpc.main.id
  availability_zone       = each.key
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, each.value)
  map_public_ip_on_launch = false

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-${each.value + 1}"
    Tier = "public"
  })
}

resource "aws_subnet" "private_runtime" {
  for_each = { for index, az in local.azs : az => index }

  vpc_id            = aws_vpc.main.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value + 16)

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-runtime-${each.value + 1}"
    Tier = "private-runtime"
  })
}

resource "aws_subnet" "isolated_data" {
  for_each = { for index, az in local.azs : az => index }

  vpc_id            = aws_vpc.main.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value + 32)

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-data-${each.value + 1}"
    Tier = "isolated-data"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private_runtime" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-runtime-rt"
  })
}

resource "aws_route_table_association" "private_runtime" {
  for_each = aws_subnet.private_runtime

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private_runtime.id
}

resource "aws_route_table" "isolated_data" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-data-rt"
  })
}

resource "aws_route_table_association" "isolated_data" {
  for_each = aws_subnet.isolated_data

  subnet_id      = each.value.id
  route_table_id = aws_route_table.isolated_data.id
}
