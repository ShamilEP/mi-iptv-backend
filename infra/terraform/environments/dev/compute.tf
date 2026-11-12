# INF-010 — DEV runtime readiness for CI / internal tests (no ALB/ECR/service yet).

resource "aws_cloudwatch_log_group" "api" {
  name              = "/mi-iptv/dev/api"
  retention_in_days = 14

  tags = merge(module.naming_tags.tags, {
    Name    = "${module.naming_tags.name_prefix}-api-logs"
    Purpose = "ci_and_internal_tests"
  })
}

resource "aws_ecs_cluster" "dev" {
  name = "${module.naming_tags.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = merge(module.naming_tags.tags, {
    Name    = "${module.naming_tags.name_prefix}-cluster"
    Purpose = "ci_and_internal_tests"
  })
}

resource "aws_ecs_cluster_capacity_providers" "dev" {
  cluster_name = aws_ecs_cluster.dev.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 0
  }
}
