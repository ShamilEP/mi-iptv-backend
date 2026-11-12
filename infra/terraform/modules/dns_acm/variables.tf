variable "name_prefix" {
  type        = string
  description = "Resource name prefix (e.g. mi-iptv-dev)."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to DNS and ACM resources."
}

variable "zone_name" {
  type        = string
  description = "Public Route 53 hosted zone name (e.g. dev.mi-iptv.example)."
}

variable "api_hostname" {
  type        = string
  description = "FQDN for the HTTPS API endpoint."
}

variable "realtime_hostname" {
  type        = string
  description = "FQDN for the realtime (WebSocket) endpoint."
}

variable "alb_dns_name" {
  type        = string
  description = "ALB DNS name for optional alias records (null until ALB exists)."
  default     = null
  nullable    = true
}

variable "alb_zone_id" {
  type        = string
  description = "ALB hosted zone ID for optional alias records."
  default     = null
  nullable    = true
}
