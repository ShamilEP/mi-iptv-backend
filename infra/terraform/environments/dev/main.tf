module "naming_tags" {
  source = "../../modules/naming_tags"

  project     = var.project
  environment = "dev"
  cost_center = var.cost_center
}

module "network" {
  source = "../../modules/network"

  name_prefix = module.naming_tags.name_prefix
  tags        = module.naming_tags.tags
  vpc_cidr    = var.vpc_cidr
  app_port    = var.app_port
}

module "rds_postgres" {
  source = "../../modules/rds_postgres"

  name_prefix             = module.naming_tags.name_prefix
  tags                    = module.naming_tags.tags
  private_data_subnet_ids = module.network.private_data_subnet_ids
  db_security_group_id    = module.network.db_security_group_id

  instance_class           = var.db_instance_class
  allocated_storage_gb     = var.db_allocated_storage_gb
  max_allocated_storage_gb = var.db_max_allocated_storage_gb
  multi_az                 = var.db_multi_az
  backup_retention_days    = var.db_backup_retention_days
  deletion_protection      = var.db_deletion_protection
  skip_final_snapshot      = var.db_skip_final_snapshot
}
