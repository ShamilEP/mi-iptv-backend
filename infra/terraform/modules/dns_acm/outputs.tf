output "zone_id" {
  value = aws_route53_zone.this.zone_id
}

output "zone_name" {
  value = aws_route53_zone.this.name
}

output "name_servers" {
  value       = aws_route53_zone.this.name_servers
  description = "Delegate the registered domain to these NS values at live cutover."
}

output "api_hostname" {
  value = var.api_hostname
}

output "realtime_hostname" {
  value = var.realtime_hostname
}

output "certificate_arn" {
  value       = aws_acm_certificate_validation.edge.certificate_arn
  description = "Validated ACM certificate ARN for the ALB HTTPS listener."
}

output "certificate_status" {
  value       = aws_acm_certificate.edge.status
  description = "ACM certificate status (ISSUED after validation when live)."
}

output "certificate_domains" {
  value = sort(tolist(local.certificate_domains))
}

output "auto_renewal" {
  value       = "acm-managed"
  description = "ACM renews DNS-validated certificates automatically."
}
