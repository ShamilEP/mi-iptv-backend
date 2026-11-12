locals {
  role_name = "mi-iptv-ci-${var.environment}"

  # Public GitHub Actions OIDC thumbprints (not secrets).
  github_thumbprints = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]

  github_sub = "repo:${var.github_org}/${var.github_repo}:*"
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = local.github_thumbprints

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-github-oidc"
  })
}

data "aws_iam_policy_document" "assume_ci" {
  statement {
    sid     = "GithubActionsOidc"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type = "Federated"
      identifiers = [
        coalesce(
          try(aws_iam_openid_connect_provider.github[0].arn, null),
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com",
        ),
      ]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.github_sub]
    }
  }
}

data "aws_caller_identity" "current" {}

resource "aws_iam_role" "ci" {
  name               = local.role_name
  assume_role_policy = data.aws_iam_policy_document.assume_ci.json

  tags = merge(var.tags, {
    Name    = local.role_name
    Purpose = "ci_and_internal_tests"
  })
}

# Least-privilege stub for DEV CI: deploy/describe only. Tighten when ECR/ALB/ECS service land.
data "aws_iam_policy_document" "ci_permissions" {
  statement {
    sid    = "EcsDeployDescribe"
    effect = "Allow"
    actions = [
      "ecs:DescribeClusters",
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition",
      "ecs:DescribeTasks",
      "ecs:ListTasks",
      "ecs:RegisterTaskDefinition",
      "ecs:UpdateService",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "EcrPushPullWhenPresent"
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken",
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "LogsWrite"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
    ]
    resources = ["arn:aws:logs:*:*:log-group:/mi-iptv/${var.environment}/*"]
  }

  statement {
    sid    = "SecretsReadDevNamesOnly"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = ["arn:aws:secretsmanager:*:*:secret:mi-iptv/${var.environment}/*"]
  }
}

resource "aws_iam_role_policy" "ci" {
  name   = "${local.role_name}-policy"
  role   = aws_iam_role.ci.id
  policy = data.aws_iam_policy_document.ci_permissions.json
}
