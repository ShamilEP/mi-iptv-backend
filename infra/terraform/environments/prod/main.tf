module "naming_tags" {
  source = "../../modules/naming_tags"

  project     = var.project
  environment = "prod"
  cost_center = var.cost_center
}

module "network" {
  source = "../../modules/network"

  name_prefix = module.naming_tags.name_prefix
  tags        = module.naming_tags.tags
  vpc_cidr    = var.vpc_cidr
  app_port    = var.app_port
}
