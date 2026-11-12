output "repository_name" {
  value = aws_ecr_repository.api.name
}

output "repository_arn" {
  value = aws_ecr_repository.api.arn
}

output "repository_url" {
  value       = aws_ecr_repository.api.repository_url
  description = "Host/path for docker push (account.dkr.ecr.region.amazonaws.com/name)."
}

output "scan_on_push" {
  value = true
}
