module "naming_tags" {
  source = "../modules/naming_tags"

  project     = "mi-iptv"
  environment = var.environment
  cost_center = "mi-iptv-mvp"
  extra_tags = {
    Purpose = "tfstate-bootstrap"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = module.naming_tags.tags
  }
}
