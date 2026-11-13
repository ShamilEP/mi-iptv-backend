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
  default = "10.10.0.0/16"
}

variable "app_port" {
  type    = number
  default = 3000
}

# INF-020 — RDS PostgreSQL (dev: small, single-AZ)
variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage_gb" {
  type    = number
  default = 20
}

variable "db_max_allocated_storage_gb" {
  type    = number
  default = 50
}

variable "db_multi_az" {
  type    = bool
  default = false
}

variable "db_backup_retention_days" {
  type    = number
  default = 1
}

variable "db_deletion_protection" {
  type    = bool
  default = false
}

variable "db_skip_final_snapshot" {
  type    = bool
  default = true
}

variable "db_delete_automated_backups" {
  type        = bool
  description = "INF-021: delete automated backups with the instance (dev)."
  default     = true
}

# INF-022 — ElastiCache Redis (dev: single-AZ micro)
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "redis_multi_az" {
  type    = bool
  default = false
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
  default = "dev.mi-iptv.example"
}

variable "api_hostname" {
  type    = string
  default = "api.dev.mi-iptv.example"
}

variable "realtime_hostname" {
  type    = string
  default = "realtime.dev.mi-iptv.example"
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

# INF-010 — DEV CI OIDC trust
variable "github_org" {
  type    = string
  default = "mi-iptv"
}

variable "github_repo" {
  type    = string
  default = "mi-iptv-backend"
}

variable "create_github_oidc_provider" {
  type    = bool
  default = true
}

# INF-031 — CloudFront price class for artwork CDN
variable "cdn_price_class" {
  type        = string
  description = "CloudFront price class (MVP NA/EU)."
  default     = "PriceClass_100"
}
