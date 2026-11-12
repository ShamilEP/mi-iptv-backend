variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "mi-iptv"
}

variable "cost_center" {
  type    = string
  default = "mi-iptv-mvp"
}

variable "vpc_cidr" {
  type    = string
  default = "10.30.0.0/16"
}

variable "app_port" {
  type    = number
  default = 3000
}

# INF-020 — RDS PostgreSQL (prod: Multi-AZ for ≥99% / NFR-014)
variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "db_allocated_storage_gb" {
  type    = number
  default = 100
}

variable "db_max_allocated_storage_gb" {
  type    = number
  default = 500
}

variable "db_multi_az" {
  type    = bool
  default = true
}

variable "db_backup_retention_days" {
  type    = number
  default = 7
}

variable "db_deletion_protection" {
  type    = bool
  default = true
}

variable "db_skip_final_snapshot" {
  type    = bool
  default = false
}

# INF-022 — ElastiCache Redis (prod: Multi-AZ)
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}

variable "redis_multi_az" {
  type    = bool
  default = true
}

variable "redis_auth_token" {
  type        = string
  description = "Redis AUTH token for live apply (TF_VAR_redis_auth_token); never commit."
  sensitive   = true
  default     = null
  nullable    = true
}
