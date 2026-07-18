module "network" {
  source = "../../modules/network"

  project     = "eventx"
  environment = "production"
  vpc_cidr    = var.vpc_cidr
  cost_center = var.cost_center
}

module "foundation" {
  source = "../../modules/foundation"

  project              = "eventx"
  environment          = "production"
  aws_region           = var.aws_region
  cost_center          = var.cost_center
  log_retention_days   = 90
  storage_cors_origins = var.portal_origins
}


module "application" {
  count  = var.deploy_application ? 1 : 0
  source = "../../modules/application"

  project                    = "eventx"
  environment                = "production"
  aws_region                 = var.aws_region
  cost_center                = var.cost_center
  vpc_id                     = module.network.vpc_id
  public_subnet_ids          = module.network.public_subnet_ids
  data_subnet_ids            = module.network.isolated_data_subnet_ids
  kms_key_arn                = module.foundation.kms_key_arn
  log_group_names            = module.foundation.log_group_names
  storage_bucket_names       = module.foundation.storage_bucket_names
  api_domain_name            = var.api_domain_name
  certificate_arn            = var.certificate_arn
  cors_origins               = sort(tolist(var.portal_origins))
  speaker_portal_url         = var.speaker_portal_url
  backend_image              = var.backend_image
  worker_image               = var.worker_image
  enable_services            = var.enable_services
  deletion_protection        = true
  alert_email                = var.alert_email
  monthly_budget_usd         = var.monthly_budget_usd
  public_demo_signup_enabled = var.public_demo_signup_enabled
  backup_retention_days      = 14
  database_instance_class    = "db.t4g.small"
}
