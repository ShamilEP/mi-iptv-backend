data "aws_caller_identity" "current" {}

locals {
  budget_name  = "${var.name_prefix}-monthly-cost"
  monitor_name = "${var.name_prefix}-cost-anomaly"
  # AWS Budgets user-tag filter: user:<Key>$<Value>
  environment_tag_filter = "user:Environment$${var.environment}"
}

# Cost allocation tags so Project / Environment / CostCenter appear in Cost Explorer.
# Account-scoped: safe once per billing account (each env mock account activates its own).
resource "aws_ce_cost_allocation_tag" "project" {
  count = var.enable_cost_allocation_tags ? 1 : 0

  tag_key = "Project"
  status  = "Active"
}

resource "aws_ce_cost_allocation_tag" "environment" {
  count = var.enable_cost_allocation_tags ? 1 : 0

  tag_key = "Environment"
  status  = "Active"
}

resource "aws_ce_cost_allocation_tag" "cost_center" {
  count = var.enable_cost_allocation_tags ? 1 : 0

  tag_key = "CostCenter"
  status  = "Active"
}

resource "aws_sns_topic" "cost_alerts" {
  name = "${var.name_prefix}-cost-alerts"

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-cost-alerts"
    Purpose = "budget-and-anomaly-alerts"
  })
}

data "aws_iam_policy_document" "cost_alerts_sns" {
  statement {
    sid    = "AWSBudgetsPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }

    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.cost_alerts.arn]
  }

  statement {
    sid    = "AWSCostAnomalyPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["costalerts.amazonaws.com"]
    }

    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.cost_alerts.arn]
  }

  statement {
    sid    = "DefaultTopicOwner"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions = [
      "SNS:Subscribe",
      "SNS:SetTopicAttributes",
      "SNS:RemovePermission",
      "SNS:Receive",
      "SNS:Publish",
      "SNS:ListSubscriptionsByTopic",
      "SNS:GetTopicAttributes",
      "SNS:DeleteTopic",
      "SNS:AddPermission",
    ]

    resources = [aws_sns_topic.cost_alerts.arn]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceOwner"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "cost_alerts" {
  arn    = aws_sns_topic.cost_alerts.arn
  policy = data.aws_iam_policy_document.cost_alerts_sns.json
}

resource "aws_sns_topic_subscription" "cost_alert_email" {
  for_each = toset(var.budget_alert_emails)

  topic_arn = aws_sns_topic.cost_alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_budgets_budget" "monthly" {
  name         = local.budget_name
  budget_type  = "COST"
  limit_amount = var.monthly_budget_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = [local.environment_tag_filter]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.cost_alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.cost_alerts.arn]
  }

  tags = merge(var.tags, {
    Name = local.budget_name
  })

  depends_on = [aws_sns_topic_policy.cost_alerts]
}

resource "aws_ce_anomaly_monitor" "environment" {
  name         = local.monitor_name
  monitor_type = "CUSTOM"

  monitor_specification = jsonencode({
    Tags = {
      Key          = "Environment"
      Values       = [var.environment]
      MatchOptions = ["EQUALS"]
    }
  })

  tags = merge(var.tags, {
    Name = local.monitor_name
  })
}

resource "aws_ce_anomaly_subscription" "environment" {
  name      = "${var.name_prefix}-cost-anomaly-sub"
  frequency = "IMMEDIATE"

  monitor_arn_list = [aws_ce_anomaly_monitor.environment.arn]

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      values        = [var.anomaly_threshold_usd]
      match_options = ["GREATER_THAN_OR_EQUAL"]
    }
  }

  subscriber {
    type    = "SNS"
    address = aws_sns_topic.cost_alerts.arn
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-cost-anomaly-sub"
  })

  depends_on = [aws_sns_topic_policy.cost_alerts]
}
