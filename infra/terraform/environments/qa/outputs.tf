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
