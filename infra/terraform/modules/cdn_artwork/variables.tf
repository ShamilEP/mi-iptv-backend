variable "name_prefix" {
  type        = string
  description = "Resource name prefix (e.g. mi-iptv-dev)."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to CDN / origin resources."
}

variable "price_class" {
  type        = string
  description = "CloudFront price class (MVP: PriceClass_100 = NA/EU)."
  default     = "PriceClass_100"
}

variable "artwork_default_ttl_seconds" {
  type        = number
  description = "Default CDN TTL for artwork objects (seconds)."
  default     = 604800 # 7 days
}

variable "artwork_min_ttl_seconds" {
  type        = number
  description = "Minimum CDN TTL for artwork objects (seconds)."
  default     = 86400 # 1 day
}

variable "artwork_max_ttl_seconds" {
  type        = number
  description = "Maximum CDN TTL for artwork objects (seconds)."
  default     = 2592000 # 30 days
}

variable "enable_versioning" {
  type        = bool
  description = "Enable S3 versioning on the artwork origin bucket."
  default     = true
}
