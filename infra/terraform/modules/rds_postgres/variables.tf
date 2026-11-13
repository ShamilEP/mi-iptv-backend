variable "name_prefix" {
  type        = string
  description = "Resource name prefix (e.g. mi-iptv-dev)."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to RDS resources."
}

variable "private_data_subnet_ids" {
  type        = list(string)
  description = "Private data subnet IDs for the DB subnet group (INF-003)."
}

variable "db_security_group_id" {
  type        = string
  description = "Security group ID allowing 5432 from the app tier only."
}

variable "engine_version" {
  type        = string
  description = "PostgreSQL major.minor version on RDS."
  default     = "16.6"
}

variable "instance_class" {
  type        = string
  description = "RDS instance class (sizing)."
}

variable "allocated_storage_gb" {
  type        = number
  description = "Initial gp3 storage in GiB."
}

variable "max_allocated_storage_gb" {
  type        = number
  description = "Autoscaling storage ceiling in GiB."
}

variable "multi_az" {
  type        = bool
  description = "Enable Multi-AZ for HA (≥99% contribution on prod)."
}

variable "backup_retention_days" {
  type        = number
  description = "Automated backup retention in days (>0 enables daily backups + PITR)."
}

variable "backup_window" {
  type        = string
  description = "UTC daily automated backup window (INF-021)."
  default     = "07:00-08:00"
}

variable "maintenance_window" {
  type        = string
  description = "UTC weekly maintenance window (must not overlap backup_window)."
  default     = "sun:08:00-sun:09:00"
}

variable "delete_automated_backups" {
  type        = bool
  description = "Delete automated backups when the instance is deleted (dev/qa true; prod false)."
  default     = true
}

variable "deletion_protection" {
  type        = bool
  description = "Prevent accidental deletion (prod on)."
  default     = false
}

variable "database_name" {
  type        = string
  description = "Initial database name."
  default     = "mi_iptv"
}

variable "master_username" {
  type        = string
  description = "Master username (password managed by RDS Secrets Manager)."
  default     = "mi_iptv_admin"
}

variable "skip_final_snapshot" {
  type        = bool
  description = "Skip final snapshot on destroy (dev/qa true; prod false)."
  default     = true
}
