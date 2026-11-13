output "budget_name" {
  value = aws_budgets_budget.monthly.name
}

output "monthly_budget_usd" {
  value = var.monthly_budget_usd
}

output "sns_topic_arn" {
  value = aws_sns_topic.cost_alerts.arn
}

output "anomaly_monitor_arn" {
  value = aws_ce_anomaly_monitor.environment.arn
}

output "anomaly_subscription_arn" {
  value = aws_ce_anomaly_subscription.environment.arn
}

output "cost_allocation_tag_keys" {
  value = var.enable_cost_allocation_tags ? ["Project", "Environment", "CostCenter"] : []
}

output "environment_tag_filter" {
  value = local.environment_tag_filter
}
