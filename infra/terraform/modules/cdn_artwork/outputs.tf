output "bucket_name" {
  value       = aws_s3_bucket.artwork.bucket
  description = "Private S3 origin for catalog artwork."
}

output "bucket_arn" {
  value = aws_s3_bucket.artwork.arn
}

output "distribution_id" {
  value       = aws_cloudfront_distribution.artwork.id
  description = "CloudFront distribution id."
}

output "distribution_domain_name" {
  value       = aws_cloudfront_distribution.artwork.domain_name
  description = "CDN hostname for artwork URLs (Sprint 0 default cert)."
}

output "artwork_cache_policy_id" {
  value       = aws_cloudfront_cache_policy.artwork.id
  description = "Cache policy id (long TTL, compress, no cookies)."
}

output "artwork_path_pattern" {
  value       = local.artwork_path_pattern
  description = "Path pattern for artwork objects."
}

output "thumbnail_variants" {
  value = ["thumb", "poster", "banner"]
  description = "Pre-generated variant names clients must request."
}
