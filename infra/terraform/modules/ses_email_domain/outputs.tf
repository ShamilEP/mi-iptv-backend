output "mail_domain" {
  value       = var.mail_domain
  description = "SES-verified domain for transactional email."
}

output "from_address" {
  value       = local.from_address
  description = "Recommended From for password-reset mail (FR-032 / BE-027)."
}

output "ses_identity_arn" {
  value = aws_ses_domain_identity.mail.arn
}

output "spf_record" {
  value = var.spf_record
}

output "dmarc_record" {
  value = local.dmarc_txt
}

output "dmarc_policy" {
  value = var.dmarc_policy
}

output "dkim_enabled" {
  value       = true
  description = "Easy DKIM CNAMEs are published in Route 53."
}

output "authentication" {
  value = {
    spf   = var.spf_record
    dkim  = "amazonses-easy-dkim"
    dmarc = local.dmarc_txt
  }
}
