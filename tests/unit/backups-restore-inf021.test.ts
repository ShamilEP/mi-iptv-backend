import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('INF-021 backups and restore drills', () => {
  const moduleMain = read('infra/terraform/modules/rds_postgres/main.tf');
  const moduleVars = read('infra/terraform/modules/rds_postgres/variables.tf');
  const moduleOut = read('infra/terraform/modules/rds_postgres/outputs.tf');
  const design = read('docs/infra/021-backups-and-restore-drills.md');
  const runbook = read('docs/infra/runbooks/rds-restore.md');
  const drillLog = read('docs/infra/runbooks/rds-restore-drill-log.md');

  it('configures automatic daily backups with retention and window', () => {
    assert.match(moduleMain, /backup_retention_period\s*=\s*var\.backup_retention_days/);
    assert.match(moduleMain, /backup_window\s*=\s*var\.backup_window/);
    assert.match(moduleVars, /variable\s+"backup_retention_days"/);
    assert.match(moduleVars, /variable\s+"backup_window"/);
    assert.match(design, /Automatic daily backups/i);
  });

  it('enables and documents point-in-time recovery when retention > 0', () => {
    assert.match(moduleMain, /PointInTimeRecovery/);
    assert.match(moduleOut, /point_in_time_recovery_enabled/);
    assert.match(
      moduleOut,
      /backup_retention_period\s*>\s*0/,
    );
    assert.match(design, /point-in-time recovery/i);
    assert.match(runbook, /Point-in-time restore/i);
  });

  it('documents restore and records a rehearsed drill', () => {
    assert.match(runbook, /Snapshot restore/i);
    assert.match(runbook, /new instance/i);
    assert.match(drillLog, /INF-021-tabletop-2026-11-13/);
    assert.match(drillLog, /\*\*Pass\*\*/);
    assert.match(design, /Rehearsed restore/i);
  });

  it('keeps prod automated backups after destroy', () => {
    const prodVars = read('infra/terraform/environments/prod/variables.tf');
    const prodMain = read('infra/terraform/environments/prod/main.tf');
    assert.match(prodVars, /db_delete_automated_backups/);
    assert.match(prodVars, /default\s*=\s*false/);
    assert.match(prodMain, /delete_automated_backups\s*=\s*var\.db_delete_automated_backups/);
  });
});
