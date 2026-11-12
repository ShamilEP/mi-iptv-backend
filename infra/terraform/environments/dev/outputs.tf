output "name_prefix" {
  value = module.naming_tags.name_prefix
}

output "tags" {
  value = module.naming_tags.tags
}

output "vpc_id" {
  value = module.network.vpc_id
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "private_app_subnet_ids" {
  value = module.network.private_app_subnet_ids
}

output "private_data_subnet_ids" {
  value = module.network.private_data_subnet_ids
}

output "alb_security_group_id" {
  value = module.network.alb_security_group_id
}

output "app_security_group_id" {
  value = module.network.app_security_group_id
}

output "db_security_group_id" {
  value = module.network.db_security_group_id
}

output "redis_security_group_id" {
  value = module.network.redis_security_group_id
}

output "db_endpoint" {
  value = module.rds_postgres.db_endpoint
}

output "db_port" {
  value = module.rds_postgres.db_port
}

output "db_name" {
  value = module.rds_postgres.db_name
}

output "db_multi_az" {
  value = module.rds_postgres.multi_az
}

output "db_parameter_group_name" {
  value = module.rds_postgres.parameter_group_name
}

output "db_required_extensions" {
  value = module.rds_postgres.required_extensions
}

output "redis_cache_endpoint" {
  value = module.elasticache_redis.cache_primary_endpoint
}

output "redis_session_endpoint" {
  value = module.elasticache_redis.session_primary_endpoint
}

output "redis_port" {
  value = module.elasticache_redis.port
}

output "redis_multi_az" {
  value = module.elasticache_redis.multi_az
}

output "redis_eviction_policies" {
  value = module.elasticache_redis.eviction_policies
}

output "redis_keyspace_prefixes" {
  value = module.elasticache_redis.keyspace_prefixes
}

output "dns_zone_id" {
  value = module.dns_acm.zone_id
}

output "dns_zone_name" {
  value = module.dns_acm.zone_name
}

output "dns_name_servers" {
  value = module.dns_acm.name_servers
}

output "api_hostname" {
  value = module.dns_acm.api_hostname
}

output "realtime_hostname" {
  value = module.dns_acm.realtime_hostname
}

output "acm_certificate_arn" {
  value = module.dns_acm.certificate_arn
}

output "acm_auto_renewal" {
  value = module.dns_acm.auto_renewal
}

output "ci_role_arn" {
  value = module.ci_oidc.role_arn
}

output "ci_role_name" {
  value = module.ci_oidc.role_name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.dev.name
}

output "ecs_cluster_arn" {
  value = aws_ecs_cluster.dev.arn
}

output "api_log_group_name" {
  value = aws_cloudwatch_log_group.api.name
}

output "ecr_repository_url" {
  value = module.ecr.repository_url
}

output "ecr_repository_name" {
  value = module.ecr.repository_name
}

output "ecr_scan_on_push" {
  value = module.ecr.scan_on_push
}

# Contract consumed by CI / internal tests (INF-010).
output "environment_contract" {
  value = {
    environment = "dev"
    purpose     = "ci_and_internal_tests"
    account     = "mi-iptv-dev"
    app_env     = "dev"
    api_hostname      = module.dns_acm.api_hostname
    realtime_hostname = module.dns_acm.realtime_hostname
    health_path       = "/health"
    ci_role_arn       = module.ci_oidc.role_arn
    ecs_cluster_name  = aws_ecs_cluster.dev.name
    api_log_group     = aws_cloudwatch_log_group.api.name
    ecr_repository_url = module.ecr.repository_url
    vpc_id            = module.network.vpc_id
  }
}
