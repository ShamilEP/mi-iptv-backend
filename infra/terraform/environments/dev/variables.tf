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
