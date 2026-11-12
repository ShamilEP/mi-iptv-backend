variable "name_prefix" {
  type        = string
  description = "Resource name prefix (e.g. mi-iptv-dev)."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to ECR resources."
}

variable "repository_suffix" {
  type        = string
  description = "Repository name suffix (final name: {name_prefix}-{suffix})."
  default     = "api"
}

variable "keep_image_count" {
  type        = number
  description = "How many tagged images to retain."
  default     = 20
}

variable "untagged_expiry_days" {
  type        = number
  description = "Expire untagged images after this many days."
  default     = 7
}
