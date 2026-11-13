variable "name_prefix" {
  type        = string
  description = "Resource name prefix (from naming_tags)."
}

variable "tags" {
  type        = map(string)
  description = "Common cost / ownership tags."
  default     = {}
}

variable "environment" {
  type        = string
  description = "Environment filter for budgets and anomaly monitors."

  validation {
    condition     = contains(["dev", "qa", "prod"], var.environment)
    error_message = "environment must be one of: dev, qa, prod."
  }
}

variable "monthly_budget_usd" {
  type        = string
  description = "Monthly COST budget limit in USD (string for aws_budgets_budget)."
  default     = "50"
}

variable "budget_alert_emails" {
  type        = list(string)
  description = "Email subscribers for budget and anomaly SNS notifications."
  default     = []
}

variable "anomaly_threshold_usd" {
  type        = string
  description = "Absolute USD threshold for Cost Anomaly Detection subscription."
  default     = "20"
}

variable "enable_cost_allocation_tags" {
  type        = bool
  description = "Activate Project/Environment/CostCenter as Cost Allocation Tags (billing)."
  default     = true
}
