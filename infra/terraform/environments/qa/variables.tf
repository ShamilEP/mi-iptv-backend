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
