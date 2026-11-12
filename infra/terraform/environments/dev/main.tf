module "naming_tags" {
  source = "../../modules/naming_tags"

  project     = var.project
  environment = "dev"
  cost_center = var.cost_center
}

module "network" {
  source = "../../modules/network"

  name_prefix = module.naming_tags.name_prefix
  tags        = module.naming_tags.tags
  vpc_cidr    = var.vpc_cidr
  app_port    = var.app_port
}

module "rds_postgres" {
  source = "../../modules/rds_postgres"

  name_prefix             = module.naming_tags.name_prefix
  tags                    = module.naming_tags.tags
  private_data_subnet_ids = module.network.private_data_subnet_ids
  db_security_group_id    = module.network.db_security_group_id

  instance_class           = var.db_instance_class
  allocated_storage_gb     = var.db_allocated_storage_gb
  max_allocated_storage_gb = var.db_max_allocated_storage_gb
  multi_az                 = var.db_multi_az
  backup_retention_days    = var.db_backup_retention_days
  deletion_protection      = var.db_deletion_protection
  skip_final_snapshot      = var.db_skip_final_snapshot
}

module "elasticache_redis" {
  source = "../../modules/elasticache_redis"

  name_prefix              = module.naming_tags.name_prefix
  tags                     = module.naming_tags.tags
  private_data_subnet_ids  = module.network.private_data_subnet_ids
  redis_security_group_id  = module.network.redis_security_group_id
  node_type                = var.redis_node_type
  multi_az                 = var.redis_multi_az
  auth_token               = var.redis_auth_token
}

module "dns_acm" {
  source = "../../modules/dns_acm"

  name_prefix        = module.naming_tags.name_prefix
  tags               = module.naming_tags.tags
  zone_name          = var.dns_zone_name
  api_hostname       = var.api_hostname
  realtime_hostname  = var.realtime_hostname
  alb_dns_name       = var.alb_dns_name
  alb_zone_id        = var.alb_zone_id
}

# INF-010 — CI identity for DEV (CI + internal tests); QA/PROD attach in later env tasks.
module "ci_oidc" {
  source = "../../modules/ci_oidc"

  name_prefix          = module.naming_tags.name_prefix
  tags                 = module.naming_tags.tags
  environment          = "dev"
  github_org           = var.github_org
  github_repo          = var.github_repo
  create_oidc_provider = var.create_github_oidc_provider
}
