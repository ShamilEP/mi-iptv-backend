module "naming_tags" {
  source = "../../modules/naming_tags"

  project     = var.project
  environment = "prod"
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
  backup_retention_days     = var.db_backup_retention_days
  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = var.db_skip_final_snapshot
  delete_automated_backups  = var.db_delete_automated_backups
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

# INF-005 — ECR for multi-stage non-root API images (scan-on-push enabled).
module "ecr" {
  source = "../../modules/ecr"

  name_prefix = module.naming_tags.name_prefix
  tags        = module.naming_tags.tags
}

# INF-031 — CloudFront + S3 CDN for catalog artwork / static assets.
module "cdn_artwork" {
  source = "../../modules/cdn_artwork"

  name_prefix = module.naming_tags.name_prefix
  tags        = module.naming_tags.tags
  price_class = var.cdn_price_class
}
