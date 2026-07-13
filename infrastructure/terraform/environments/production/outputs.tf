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
