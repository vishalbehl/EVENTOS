output "foundation" {
  value = {
    kms_key_arn          = module.foundation.kms_key_arn
    ecr_repository_urls  = module.foundation.ecr_repository_urls
    storage_bucket_names = module.foundation.storage_bucket_names
    log_group_names      = module.foundation.log_group_names
  }
}

output "network" {
  value = {
    vpc_id                     = module.network.vpc_id
    public_subnet_ids          = module.network.public_subnet_ids
    private_runtime_subnet_ids = module.network.private_runtime_subnet_ids
    isolated_data_subnet_ids   = module.network.isolated_data_subnet_ids
  }
}

output "application" {
  value = var.deploy_application ? {
    api_load_balancer_dns_name    = module.application[0].api_load_balancer_dns_name
    api_load_balancer_zone_id     = module.application[0].api_load_balancer_zone_id
    ecs_cluster_name              = module.application[0].ecs_cluster_name
    backend_service_name          = module.application[0].backend_service_name
    worker_service_name           = module.application[0].worker_service_name
    runtime_secret_arn            = module.application[0].runtime_secret_arn
    deployment_secret_arn         = module.application[0].deployment_secret_arn
    identity_bootstrap_secret_arn = module.application[0].identity_bootstrap_secret_arn
    database_endpoint             = module.application[0].database_endpoint
    database_master_secret_arn    = module.application[0].database_master_secret_arn
    redis_endpoint                = module.application[0].redis_endpoint
    backend_task_definition_arn   = module.application[0].backend_task_definition_arn
    database_bootstrap_task_arn   = module.application[0].database_bootstrap_task_definition_arn
    migration_task_arn            = module.application[0].migration_task_definition_arn
    identity_bootstrap_task_arn   = module.application[0].identity_bootstrap_task_definition_arn
    runtime_security_group_id     = module.application[0].runtime_security_group_id
  } : null
  sensitive = true
}
