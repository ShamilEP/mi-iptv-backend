variable "name_prefix" {
  type        = string
  description = "Resource name prefix (e.g. mi-iptv-dev)."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to IAM / OIDC resources."
}

variable "environment" {
  type        = string
  description = "Environment slug (dev|qa|prod)."
}

variable "github_org" {
  type        = string
  description = "GitHub organization or user for OIDC trust."
  default     = "mi-iptv"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository name for OIDC trust."
  default     = "mi-iptv-backend"
}

variable "create_oidc_provider" {
  type        = bool
  description = "Create the account-level GitHub OIDC provider (once per account)."
  default     = true
}
