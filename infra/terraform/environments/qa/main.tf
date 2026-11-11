module "naming_tags" {
  source = "../../modules/naming_tags"

  project     = var.project
  environment = "qa"
  cost_center = var.cost_center
}

# Platform resources (VPC, ECS, RDS, Redis, KMS, …) land in later INF tasks.
# This root establishes remote state + required tags for all future resources.
