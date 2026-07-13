module "network" {
  source = "../../modules/network"

  project      = "eventx"
  environment  = "nonprod"
  vpc_cidr     = var.vpc_cidr
  cost_center  = var.cost_center
}

module "foundation" {
  source = "../../modules/foundation"

  project            = "eventx"
  environment        = "nonprod"
  aws_region         = var.aws_region
  cost_center        = var.cost_center
  log_retention_days = 14
}
