output "db_instance_id" {
  value       = aws_db_instance.this.id
  description = "RDS instance identifier."
}

output "db_endpoint" {
  value       = aws_db_instance.this.address
  description = "Hostname for DATABASE_URL (no credentials)."
}

output "db_port" {
  value       = aws_db_instance.this.port
  description = "PostgreSQL port (5432)."
}

output "db_name" {
  value       = aws_db_instance.this.db_name
  description = "Initial database name."
}

output "master_user_secret_arn" {
  value       = try(aws_db_instance.this.master_user_secret[0].secret_arn, null)
  description = "Secrets Manager ARN for the managed master password."
  sensitive   = true
}

output "parameter_group_name" {
  value = aws_db_parameter_group.this.name
}

output "db_subnet_group_name" {
  value = aws_db_subnet_group.this.name
}

output "multi_az" {
  value       = aws_db_instance.this.multi_az
  description = "Whether Multi-AZ HA is enabled."
}

output "required_extensions" {
  value       = local.required_extensions
  description = "Extensions created by schema migration after cutover."
}
