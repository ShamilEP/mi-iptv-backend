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

variable "db_delete_automated_backups" {
  type        = bool
  description = "INF-021: keep automated backups after instance delete on prod."
  default     = false
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

# INF-004 — DNS + ACM (mock .example zone until real domain)
variable "dns_zone_name" {
  type    = string
  default = "mi-iptv.example"
}

variable "api_hostname" {
  type    = string
  default = "api.mi-iptv.example"
}

variable "realtime_hostname" {
  type    = string
  default = "realtime.mi-iptv.example"
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

# INF-031 — CloudFront price class for artwork CDN
variable "cdn_price_class" {
  type        = string
  description = "CloudFront price class (MVP NA/EU; raise for broader edge later)."
  default     = "PriceClass_100"
}

# INF-033 — transactional email domain (password-reset)
variable "mail_domain" {
  type        = string
  description = "SES sending domain (SPF/DKIM/DMARC)."
  default     = "mi-iptv.example"
}

variable "mail_dmarc_policy" {
  type        = string
  description = "DMARC policy for the mail domain."
  default     = "quarantine"
}
