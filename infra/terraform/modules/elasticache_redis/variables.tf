variable "name_prefix" {
  type        = string
  description = "Resource name prefix (e.g. mi-iptv-dev)."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to ElastiCache resources."
}

variable "private_data_subnet_ids" {
  type        = list(string)
  description = "Private data subnet IDs for the Redis subnet group (INF-003)."
}

variable "redis_security_group_id" {
  type        = string
  description = "Security group ID allowing 6379 from the app tier only."
}

variable "node_type" {
  type        = string
  description = "ElastiCache node type for both logical instances."
}

variable "engine_version" {
  type        = string
  description = "Redis engine version on ElastiCache."
  default     = "7.1"
}

variable "multi_az" {
  type        = bool
  description = "Enable Multi-AZ replica + automatic failover (qa/prod)."
  default     = false
}

variable "auth_token" {
  type        = string
  description = "Redis AUTH token (set via TF_VAR at live apply; never commit)."
  sensitive   = true
  default     = null
  nullable    = true
}
