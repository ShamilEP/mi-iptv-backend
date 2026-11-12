locals {
  parameter_group_family = "redis7"
  num_cache_clusters     = var.multi_az ? 2 : 1

  # Keyspace roles — cache vs session/pubsub must not share eviction (INF-022 / schema notes).
  instances = {
    cache = {
      purpose           = "cache"
      maxmemory_policy  = "allkeys-lru"
      description       = "Catalog/EPG cache with TTL; safe to LRU-evict under pressure."
      keyspace_prefixes = ["cache:"]
    }
    session = {
      purpose           = "session"
      maxmemory_policy  = "noeviction"
      description       = "JWT deny-list, rate limits, presence, and Pub/Sub (no silent eviction)."
      keyspace_prefixes = ["jwt:deny:", "rl:", "presence:", "dev:"]
    }
  }
}

resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name_prefix}-redis"
  subnet_ids = var.private_data_subnet_ids

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-redis-subnets"
  })
}

resource "aws_elasticache_parameter_group" "role" {
  for_each = local.instances

  name   = "${var.name_prefix}-redis-${each.key}"
  family = local.parameter_group_family

  parameter {
    name  = "maxmemory-policy"
    value = each.value.maxmemory_policy
  }

  tags = merge(var.tags, {
    Name             = "${var.name_prefix}-redis-${each.key}"
    RedisRole        = each.value.purpose
    MaxmemoryPolicy  = each.value.maxmemory_policy
    KeyspacePrefixes = join(",", each.value.keyspace_prefixes)
  })
}

resource "aws_elasticache_replication_group" "role" {
  for_each = local.instances

  replication_group_id = "${var.name_prefix}-redis-${each.key}"
  description          = each.value.description

  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.role[each.key].name
  subnet_group_name    = aws_elasticache_subnet_group.this.name
  security_group_ids   = [var.redis_security_group_id]

  num_cache_clusters         = local.num_cache_clusters
  automatic_failover_enabled = var.multi_az
  multi_az_enabled           = var.multi_az

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.auth_token

  apply_immediately = false

  tags = merge(var.tags, {
    Name            = "${var.name_prefix}-redis-${each.key}"
    RedisRole       = each.value.purpose
    MaxmemoryPolicy = each.value.maxmemory_policy
  })
}
