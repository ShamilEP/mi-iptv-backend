import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('INF-061 cost budgets, tags, and anomaly alerts', () => {
  const moduleMain = read('infra/terraform/modules/cost_budgets/main.tf');
  const design = read('docs/infra/061-cost-budgets-alerts.md');

  it('defines a per-environment monthly COST budget with tag filter', () => {
    assert.match(moduleMain, /aws_budgets_budget" "monthly"/);
    assert.match(moduleMain, /budget_type\s*=\s*"COST"/);
    assert.match(moduleMain, /time_unit\s*=\s*"MONTHLY"/);
    assert.match(moduleMain, /TagKeyValue/);
    assert.match(moduleMain, /user:Environment/);
    assert.match(design, /Per-environment/i);
  });

  it('activates Project / Environment / CostCenter allocation tags', () => {
    assert.match(moduleMain, /aws_ce_cost_allocation_tag" "project"/);
    assert.match(moduleMain, /aws_ce_cost_allocation_tag" "environment"/);
    assert.match(moduleMain, /aws_ce_cost_allocation_tag" "cost_center"/);
    assert.match(moduleMain, /tag_key\s*=\s*"Project"/);
    assert.match(moduleMain, /tag_key\s*=\s*"Environment"/);
    assert.match(moduleMain, /tag_key\s*=\s*"CostCenter"/);
    assert.match(design, /Cost Allocation Tags/i);
  });

  it('configures Cost Anomaly Detection with SNS alerts', () => {
    assert.match(moduleMain, /aws_ce_anomaly_monitor" "environment"/);
    assert.match(moduleMain, /monitor_type\s*=\s*"CUSTOM"/);
    assert.match(moduleMain, /aws_ce_anomaly_subscription" "environment"/);
    assert.match(moduleMain, /aws_sns_topic" "cost_alerts"/);
    assert.match(moduleMain, /costalerts\.amazonaws\.com/);
    assert.match(moduleMain, /budgets\.amazonaws\.com/);
    assert.match(design, /Anomaly/i);
  });

  it('wires cost_budgets into env roots with distinct budget defaults', () => {
    const budgetDefaults: Record<string, string> = {
      dev: '50',
      qa: '100',
      prod: '500',
    };
    const anomalyDefaults: Record<string, string> = {
      dev: '20',
      qa: '40',
      prod: '100',
    };

    for (const env of ['dev', 'qa', 'prod'] as const) {
      const main = read(`infra/terraform/environments/${env}/main.tf`);
      const variables = read(
        `infra/terraform/environments/${env}/variables.tf`,
      );
      assert.match(main, /module\s+"cost_budgets"/);
      assert.match(main, /source\s*=\s*"\.\.\/\.\.\/modules\/cost_budgets"/);
      assert.match(main, new RegExp(`environment\\s*=\\s*"${env}"`));
      assert.match(
        variables,
        new RegExp(
          `monthly_budget_usd[\\s\\S]*?default\\s*=\\s*"${budgetDefaults[env]}"`,
        ),
      );
      assert.match(
        variables,
        new RegExp(
          `anomaly_threshold_usd[\\s\\S]*?default\\s*=\\s*"${anomalyDefaults[env]}"`,
        ),
      );
    }
  });
});

