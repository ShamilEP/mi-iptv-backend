locals {
  # Single cert covers API + realtime for ALB host-based routing.
  certificate_domains = toset([
    var.api_hostname,
    var.realtime_hostname,
  ])

  create_alb_aliases = var.alb_dns_name != null && var.alb_zone_id != null
}

resource "aws_route53_zone" "this" {
  name = var.zone_name

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-public-zone"
  })
}

resource "aws_acm_certificate" "edge" {
  domain_name               = var.api_hostname
  subject_alternative_names = [var.realtime_hostname]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(var.tags, {
    Name              = "${var.name_prefix}-edge-tls"
    AutoRenew         = "acm-managed"
    ApiHostname       = var.api_hostname
    RealtimeHostname  = var.realtime_hostname
  })
}

resource "aws_route53_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.edge.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  zone_id         = aws_route53_zone.this.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
}

resource "aws_acm_certificate_validation" "edge" {
  certificate_arn         = aws_acm_certificate.edge.arn
  validation_record_fqdns = [for record in aws_route53_record.acm_validation : record.fqdn]
}

# Optional — wired when ALB module supplies dns_name + zone_id (later INF).
resource "aws_route53_record" "api_alias" {
  count = local.create_alb_aliases ? 1 : 0

  zone_id = aws_route53_zone.this.zone_id
  name    = var.api_hostname
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "realtime_alias" {
  count = local.create_alb_aliases ? 1 : 0

  zone_id = aws_route53_zone.this.zone_id
  name    = var.realtime_hostname
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}
