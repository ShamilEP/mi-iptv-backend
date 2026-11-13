locals {
  # Path layout for pre-generated TV-safe variants (INF-031).
  # artwork/{contentId}/{variant}.{ext}  variant ∈ thumb|poster|banner
  artwork_path_pattern = "/artwork/*"

  # Query keys reserved if/when an image optimizer is added later.
  # Sprint 0 serves pre-sized objects; whitelist kept empty on origin requests.
  resize_query_keys = ["w", "h", "format"]
}

resource "aws_s3_bucket" "artwork" {
  bucket = "${var.name_prefix}-catalog-artwork"

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-catalog-artwork"
    Purpose = "cdn-origin-artwork"
  })
}

resource "aws_s3_bucket_public_access_block" "artwork" {
  bucket = aws_s3_bucket.artwork.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "artwork" {
  bucket = aws_s3_bucket.artwork.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artwork" {
  bucket = aws_s3_bucket.artwork.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "artwork" {
  name                              = "${var.name_prefix}-artwork-oac"
  description                       = "OAC for private catalog artwork origin"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Long-lived cache for immutable / content-addressed artwork variants.
resource "aws_cloudfront_cache_policy" "artwork" {
  name        = "${var.name_prefix}-artwork-cache"
  comment     = "INF-031 artwork: long TTL, compress, no cookies/auth headers"
  default_ttl = var.artwork_default_ttl_seconds
  max_ttl     = var.artwork_max_ttl_seconds
  min_ttl     = var.artwork_min_ttl_seconds

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      # Pre-generated variants use path only; ignore unknown query noise.
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "artwork" {
  name    = "${var.name_prefix}-artwork-headers"
  comment = "Security + cache hints for TV clients"

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "same-origin"
      override        = true
    }
  }

  custom_headers_config {
    items {
      header   = "Cache-Control"
      value    = "public, max-age=86400, s-maxage=${var.artwork_default_ttl_seconds}"
      override = false
    }
  }
}

resource "aws_cloudfront_distribution" "artwork" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.name_prefix} catalog artwork CDN (INF-031)"
  price_class         = var.price_class
  default_root_object = ""

  origin {
    domain_name              = aws_s3_bucket.artwork.bucket_regional_domain_name
    origin_id                = "s3-artwork"
    origin_access_control_id = aws_cloudfront_origin_access_control.artwork.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-artwork"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id            = aws_cloudfront_cache_policy.artwork.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.artwork.id
  }

  # Explicit artwork path behavior (same policy; documents intent for future behaviors).
  ordered_cache_behavior {
    path_pattern           = local.artwork_path_pattern
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-artwork"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id            = aws_cloudfront_cache_policy.artwork.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.artwork.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = merge(var.tags, {
    Name              = "${var.name_prefix}-artwork-cdn"
    ArtworkPath       = local.artwork_path_pattern
    ThumbnailStrategy = "pre-generated-variants"
    ResizeQueryKeys   = join(",", local.resize_query_keys)
  })
}

data "aws_iam_policy_document" "artwork_oac" {
  statement {
    sid    = "AllowCloudFrontRead"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.artwork.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.artwork.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "artwork" {
  bucket = aws_s3_bucket.artwork.id
  policy = data.aws_iam_policy_document.artwork_oac.json
}
