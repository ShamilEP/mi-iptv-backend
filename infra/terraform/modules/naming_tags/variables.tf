variable "project" {
  type        = string
  description = "Short project id used in names and tags."
  default     = "mi-iptv"
}

variable "environment" {
  type        = string
  description = "Deployment environment: dev, qa, or prod."

  validation {
    condition     = contains(["dev", "qa", "prod"], var.environment)
    error_message = "environment must be one of: dev, qa, prod."
  }
}

variable "cost_center" {
  type        = string
  description = "Cost allocation tag value."
  default     = "mi-iptv-mvp"
}

variable "managed_by" {
  type        = string
  description = "Automation system owning the resource."
  default     = "terraform"
}

variable "extra_tags" {
  type        = map(string)
  description = "Optional additional tags merged into the standard set."
  default     = {}
}
