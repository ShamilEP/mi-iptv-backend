# SEC-031: private-app Network ACL — controlled egress beyond security groups.
# Explicitly denies link-local / cloud metadata (IMDS) even if SG rules later
# allow TCP/80 for plain-HTTP IPTV sources.

resource "aws_network_acl" "private_app" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-private-app-nacl"
    Tier = "private-app"
  })
}

resource "aws_network_acl_association" "private_app" {
  count = var.az_count

  network_acl_id = aws_network_acl.private_app.id
  subnet_id      = aws_subnet.private_app[count.index].id
}

# --- Egress (lowest rule number wins) ---

resource "aws_network_acl_rule" "private_app_egress_deny_link_local" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 50
  egress         = true
  protocol       = "-1"
  rule_action    = "deny"
  cidr_block     = "169.254.0.0/16"
}

resource "aws_network_acl_rule" "private_app_egress_allow_vpc" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 100
  egress         = true
  protocol       = "-1"
  rule_action    = "allow"
  cidr_block     = var.vpc_cidr
}

resource "aws_network_acl_rule" "private_app_egress_allow_https" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 110
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 443
  to_port        = 443
}

resource "aws_network_acl_rule" "private_app_egress_allow_dns_udp" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 120
  egress         = true
  protocol       = "udp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 53
  to_port        = 53
}

resource "aws_network_acl_rule" "private_app_egress_allow_dns_tcp" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 130
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 53
  to_port        = 53
}

# --- Ingress ---

resource "aws_network_acl_rule" "private_app_ingress_allow_vpc" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 100
  egress         = false
  protocol       = "-1"
  rule_action    = "allow"
  cidr_block     = var.vpc_cidr
}

# Ephemeral ports for responses from NAT / internet (HTTPS, DNS).
resource "aws_network_acl_rule" "private_app_ingress_allow_ephemeral" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 110
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 1024
  to_port        = 65535
}

resource "aws_network_acl_rule" "private_app_ingress_allow_dns_udp" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 120
  egress         = false
  protocol       = "udp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 1024
  to_port        = 65535
}
