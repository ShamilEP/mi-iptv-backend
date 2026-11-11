variable "environment" {
  type        = string
  description = "Environment this state backend belongs to (dev|qa|prod)."
}

variable "aws_region" {
  type        = string
  description = "AWS region for the state bucket and lock table."
  default     = "us-east-1"
}

variable "aws_account_id" {
  type        = string
  description = "AWS account id (mock IDs from INF-001 until live cutover)."
}
