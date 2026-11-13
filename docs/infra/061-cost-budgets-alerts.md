# INF-061: Cost budgets and anomaly alerts

- **Status:** Accepted (Sprint 0 **mock** baseline)
- **Refs:** Infra §1; INF-002 (`naming_tags`)
- **Task:** INF-061
- **Mock date:** 2026-11-13

## Goal

Provide **per-environment** AWS cost controls: monthly budgets filtered by `Environment` tag, activate cost-allocation tags from INF-002, and Cost Anomaly Detection alerts to SNS.

## Sprint 0 mock

Live `terraform apply` is deferred. Module + env wiring are the accepted baseline.

## Layout

```text
infra/terraform/modules/cost_budgets/
  main.tf       # budgets, CE anomaly monitor/subscription, SNS, allocation tags
  variables.tf
  outputs.tf
  versions.tf
```

Wired from `environments/{dev,qa,prod}` as `module.cost_budgets`.

## Per-environment defaults (mock)

| Env | Monthly budget (USD) | Anomaly absolute threshold (USD) |
| --- | --- | --- |
| `dev` | `50` | `20` |
| `qa` | `100` | `40` |
| `prod` | `500` | `100` |

Override via `monthly_budget_usd` / `anomaly_threshold_usd` / `budget_alert_emails`.

## Tags

Resource tags continue to come from `naming_tags` (`Project`, `Environment`, `ManagedBy`, `CostCenter`).

This module also activates **Cost Allocation Tags** for `Project`, `Environment`, and `CostCenter` so Cost Explorer and Budgets can filter on them (account-scoped; each env mock account activates once).

Budgets use cost filter `TagKeyValue` = `user:Environment$<env>`.

## Alerts

1. **AWS Budgets** — ACTUAL ≥ 80% and FORECASTED ≥ 100% of monthly limit → SNS.
2. **Cost Anomaly Detection** — CUSTOM monitor on `Environment` tag; IMMEDIATE subscription to the same SNS topic when absolute impact ≥ threshold.
3. SNS topic policy allows `budgets.amazonaws.com` and `costalerts.amazonaws.com` to publish.
4. Optional email subscriptions via `budget_alert_emails` (confirmation required in AWS).

## Verification checklist (DoD) — mock complete

- [x] Per-environment monthly COST budgets
- [x] Cost / ownership tags (INF-002 + allocation tag activation)
- [x] Anomaly alerts (CE monitor + SNS subscription)

## Live cutover

1. Set real `budget_alert_emails` (or subscribe ChatOps to SNS).
2. Confirm allocation tags show as **Active** in Billing console (can take up to 24h for new spend).
3. Tune budget limits after first billing cycle with real usage.
