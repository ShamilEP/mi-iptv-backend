import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('INF-062 disaster recovery and operations runbooks', () => {
  const design = read('docs/infra/062-disaster-recovery-ops-runbooks.md');
  const index = read('docs/infra/runbooks/README.md');
  const restore = read('docs/infra/runbooks/rds-restore.md');
  const rollback = read('docs/infra/runbooks/deploy-rollback.md');
  const keyCompromise = read('docs/infra/runbooks/key-compromise.md');
  const failover = read('docs/infra/runbooks/failover.md');

  it('documents restore procedure (snapshot + PITR, new instance)', () => {
    assert.match(restore, /Snapshot restore/i);
    assert.match(restore, /Point-in-time restore/i);
    assert.match(restore, /new instance/i);
    assert.match(design, /Restore/i);
    assert.match(index, /rds-restore\.md/);
  });

  it('documents deploy and migration rollback procedures', () => {
    assert.match(rollback, /Application \/ image rollback/i);
    assert.match(rollback, /Migration-aware rollback/i);
    assert.match(rollback, /forward-only/i);
    assert.match(design, /Rollback/i);
    assert.match(index, /deploy-rollback\.md/);
  });

  it('documents key compromise procedures for JWT, DEK/CMK, Redis, push', () => {
    assert.match(keyCompromise, /JWT access signing key/i);
    assert.match(keyCompromise, /Source-credential DEK/i);
    assert.match(keyCompromise, /CMK compromise/i);
    assert.match(keyCompromise, /Redis AUTH/i);
    assert.match(keyCompromise, /FCM|APNs/i);
    assert.match(design, /Key compromise/i);
    assert.match(index, /key-compromise\.md/);
  });

  it('documents RDS and Redis Multi-AZ failover procedures', () => {
    assert.match(failover, /RDS Multi-AZ failover/i);
    assert.match(failover, /ElastiCache Redis failover/i);
    assert.match(failover, /automatic failover/i);
    assert.match(design, /Failover/i);
    assert.match(index, /failover\.md/);
  });
});
