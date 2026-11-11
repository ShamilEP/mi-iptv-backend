output "name_prefix" {
  description = "Standard name prefix: project-environment"
  value       = "${var.project}-${var.environment}"
}

output "tags" {
  description = "Required cost and ownership tags for all resources."
  value = merge(
    {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = var.managed_by
      CostCenter  = var.cost_center
    },
    var.extra_tags,
  )
}
