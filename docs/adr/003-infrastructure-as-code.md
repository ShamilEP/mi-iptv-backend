# ADR-003: Infrastructure as code tool

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** Infra (INF-002)
- **Refs:** Infra §2; ADR-001 (AWS); INF-001 mock accounts

## Context

INF-002 requires an IaC approach for AWS resources with remote state, consistent naming, and cost tags. Options named in the tracker: Terraform, Pulumi, or AWS CDK.

## Decision

Use **Terraform** (HCL) under `infra/terraform/` for MVP infrastructure.

| Concern | Choice |
| --- | --- |
| Tool | Terraform ≥ 1.5 |
| Cloud | AWS (ADR-001) |
| Layout | Shared modules + per-environment roots (`dev` / `qa` / `prod`) |
| Remote state | S3 backend + DynamoDB lock table (per account/env) |
| Naming / tags | Shared `naming_tags` module (`Project`, `Environment`, `ManagedBy`, `CostCenter`) |

## Consequences

- Future INF tasks (VPC, ECS, RDS, Redis, KMS) add Terraform resources into modules/stacks — not ad-hoc console clicks.
- State files stay out of git; backend config uses env-specific bucket/table names.
- No npm/CDK packages required for IaC (keeps backend package approval surface smaller).

## Rejected for MVP

- **AWS CDK** — stronger for TypeScript teams, but adds Node SDK surface and synthesize complexity for Sprint 0.
- **Pulumi** — similar capabilities; Terraform has broader ops familiarity for AWS MVP.
