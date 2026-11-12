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
  default = "10.20.0.0/16"
}

variable "app_port" {
  type    = number
  default = 3000
}

# INF-020 — RDS PostgreSQL (qa: Multi-AZ rehearsal)
variable "db_instance_class" {
  type    = string
  default = "db.t4g.small"
}

variable "db_allocated_storage_gb" {
  type    = number
  default = 50
}

variable "db_max_allocated_storage_gb" {
  type    = number
  default = 100
}

variable "db_multi_az" {
  type    = bool
  default = true
}

variable "db_backup_retention_days" {
  type    = number
  default = 3
}

variable "db_deletion_protection" {
  type    = bool
  default = false
}

variable "db_skip_final_snapshot" {
  type    = bool
  default = true
}

# INF-022 — ElastiCache Redis (qa: Multi-AZ)
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

# INF-004 — DNS + ACM (mock .example zone until real domain)
variable "dns_zone_name" {
  type    = string
  default = "qa.mi-iptv.example"
}

variable "api_hostname" {
  type    = string
  default = "api.qa.mi-iptv.example"
}

variable "realtime_hostname" {
  type    = string
  default = "realtime.qa.mi-iptv.example"
}

variable "alb_dns_name" {
  type     = string
  default  = null
  nullable = true
}

variable "alb_zone_id" {
  type     = string
  default  = null
  nullable = true
}
