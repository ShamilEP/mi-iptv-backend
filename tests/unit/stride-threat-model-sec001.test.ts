import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const doc = readFileSync(
  join(root, 'docs/security/001-stride-threat-model.md'),
  'utf8',
);

describe('SEC-001 STRIDE threat model', () => {
  it('covers auth, sync, realtime, source ingestion, and QoE', () => {
    assert.match(doc, /## 1\. Auth/i);
    assert.match(doc, /## 2\. Sync/i);
    assert.match(doc, /## 3\. Realtime/i);
    assert.match(doc, /## 4\. Source ingestion/i);
    assert.match(doc, /## 5\. QoE/i);
    for (const letter of ['S', 'T', 'R', 'I', 'D', 'E']) {
      assert.match(doc, new RegExp(`\\| ${letter} \\|`));
    }
  });

  it('produces prioritized mitigations that feed the backlog', () => {
    assert.match(doc, /Prioritized mitigation backlog/i);
    assert.match(doc, /\|\s*P0\s*\|/);
    assert.match(doc, /\|\s*P1\s*\|/);
    const requiredFeeds = [
      'BE-006',
      'BE-062',
      'BE-077',
      'BE-080',
      'SEC-020',
      'SEC-031',
      'SEC-003',
      'SEC-040',
    ];
    for (const id of requiredFeeds) {
      assert.match(doc, new RegExp(id));
    }
  });

  it('marks the DoD checklist complete', () => {
    assert.match(doc, /- \[x\] Auth covered/);
    assert.match(doc, /- \[x\] Sync covered/);
    assert.match(doc, /- \[x\] Realtime \/ remote control covered/);
    assert.match(doc, /- \[x\] Source ingestion covered/);
    assert.match(doc, /- \[x\] QoE endpoint covered/);
    assert.match(doc, /- \[x\] Prioritized mitigations mapped to backlog task IDs/);
  });
});
