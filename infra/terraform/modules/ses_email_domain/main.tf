locals {
  dmarc_rua = coalesce(var.dmarc_rua, "mailto:dmarc-reports@${var.mail_domain}")
  dmarc_txt = "v=DMARC1; p=${var.dmarc_policy}; pct=100; adkim=s; aspf=s; rua=${local.dmarc_rua}"
  # Password-reset From address used by BE-027 when wired to SES.
  from_address = "noreply@${var.mail_domain}"
}

resource "aws_ses_domain_identity" "mail" {
  domain = var.mail_domain
}

resource "aws_ses_domain_dkim" "mail" {
  domain = aws_ses_domain_identity.mail.domain
}

# SES domain ownership verification (TXT).
resource "aws_route53_record" "ses_verification" {
  zone_id = var.zone_id
  name    = "_amazonses.${var.mail_domain}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.mail.verification_token]
}

# Easy DKIM — three CNAMEs published by SES.
resource "aws_route53_record" "ses_dkim" {
  count = 3

  zone_id = var.zone_id
  name    = "${aws_ses_domain_dkim.mail.dkim_tokens[count.index]}._domainkey.${var.mail_domain}"
  type    = "CNAME"
  ttl     = 600
  records = [
    "${aws_ses_domain_dkim.mail.dkim_tokens[count.index]}.dkim.amazonses.com",
  ]
}

# SPF for the transactional mail domain (password-reset From).
resource "aws_route53_record" "spf" {
  zone_id = var.zone_id
  name    = var.mail_domain
  type    = "TXT"
  ttl     = 600
  records = [var.spf_record]
}

# DMARC policy for the same domain.
resource "aws_route53_record" "dmarc" {
  zone_id = var.zone_id
  name    = "_dmarc.${var.mail_domain}"
  type    = "TXT"
  ttl     = 600
  records = [local.dmarc_txt]
}

resource "aws_ses_domain_identity_verification" "mail" {
  domain = aws_ses_domain_identity.mail.id

  depends_on = [
    aws_route53_record.ses_verification,
    aws_route53_record.ses_dkim,
  ]
}
