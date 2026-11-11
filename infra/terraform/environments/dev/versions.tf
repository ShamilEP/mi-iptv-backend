terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state — mock bucket/table from INF-001 / INF-002 docs. Init with:
  #   terraform init -backend-config=backend.hcl
  backend "s3" {}
}
