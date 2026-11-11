variable "name_prefix" {
  type        = string
  description = "Resource name prefix (e.g. mi-iptv-dev)."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to all network resources."
}

variable "vpc_cidr" {
  type        = string
  description = "VPC IPv4 CIDR block."
}

variable "az_count" {
  type        = number
  description = "Number of AZs for subnets (2 recommended for MVP)."
  default     = 2
}

variable "app_port" {
  type        = number
  description = "Container/listener port for the API (ALB → app)."
  default     = 3000
}

variable "enable_nat_gateway" {
  type        = bool
  description = "Create a single NAT gateway for private app egress."
  default     = true
}
