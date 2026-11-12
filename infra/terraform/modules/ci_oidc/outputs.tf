output "role_name" {
  value = aws_iam_role.ci.name
}

output "role_arn" {
  value = aws_iam_role.ci.arn
}

output "oidc_provider_arn" {
  value = try(aws_iam_openid_connect_provider.github[0].arn, null)
}

output "github_sub" {
  value       = local.github_sub
  description = "OIDC subject claim pattern trusted by the CI role."
}
