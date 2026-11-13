variable "name_prefix" {
  type        = string
  description = "Resource name prefix (from naming_tags)."
}

variable "tags" {
  type        = map(string)
  description = "Common tags."
  default     = {}
}

variable "zone_id" {
  type        = string
  description = "Route 53 hosted zone ID that owns mail_domain (from dns_acm)."
}

variable "mail_domain" {
  type        = string
  description = "Verified SES sending domain for transactional mail (password-reset From)."
}

variable "spf_record" {
  type        = string
  description = "SPF TXT value authorizing Amazon SES."
  default     = "v=spf1 include:amazonses.com ~all"
}

variable "dmarc_policy" {
  type        = string
  description = "DMARC policy (quarantine for MVP; tighten to reject after monitoring)."
  default     = "quarantine"

  validation {
    condition     = contains(["none", "quarantine", "reject"], var.dmarc_policy)
    error_message = "dmarc_policy must be none, quarantine, or reject."
  }
}

variable "dmarc_rua" {
  type        = string
  description = "DMARC aggregate report mailbox (rua)."
  default     = null
  nullable    = true
}
