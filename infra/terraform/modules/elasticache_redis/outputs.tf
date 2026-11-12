output "subnet_group_name" {
  value = aws_elasticache_subnet_group.this.name
}

output "cache_primary_endpoint" {
  value       = aws_elasticache_replication_group.role["cache"].primary_endpoint_address
  description = "Hostname for REDIS_CACHE_URL (catalog cache)."
}

output "session_primary_endpoint" {
  value       = aws_elasticache_replication_group.role["session"].primary_endpoint_address
  description = "Hostname for REDIS_URL (sessions, deny-list, pub/sub)."
}

output "port" {
  value = 6379
}

output "cache_replication_group_id" {
  value = aws_elasticache_replication_group.role["cache"].id
}

output "session_replication_group_id" {
  value = aws_elasticache_replication_group.role["session"].id
}

output "cache_parameter_group_name" {
  value = aws_elasticache_parameter_group.role["cache"].name
}

output "session_parameter_group_name" {
  value = aws_elasticache_parameter_group.role["session"].name
}

output "multi_az" {
  value = var.multi_az
}

output "eviction_policies" {
  value = {
    for k, v in local.instances : k => v.maxmemory_policy
  }
  description = "Eviction policy per logical instance."
}

output "keyspace_prefixes" {
  value = {
    for k, v in local.instances : k => v.keyspace_prefixes
  }
  description = "Key/channel prefix ownership per instance."
}
