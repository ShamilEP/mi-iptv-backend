import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('SEC-004 dependency and image vulnerability policy', () => {
  const policy = read('docs/security/004-dependency-image-vulnerability-policy.md');
  const securityScans = read('.github/workflows/security-scans.yml');
  const containerImage = read('.github/workflows/container-image.yml');
  const dependabot = read('.github/dependabot.yml');
  const packageJson = read('package.json');

  it('documents SCA and container gates with severity thresholds', () => {
    assert.match(policy, /Severity thresholds/i);
    assert.match(policy, /npm audit/);
    assert.match(policy, /Trivy/);
    assert.match(policy, /HIGH,\s*CRITICAL|high.*critical/i);
    assert.match(securityScans, /npm run security:deps/);
    assert.match(securityScans, /severity:\s*HIGH,CRITICAL/);
    assert.match(containerImage, /severity:\s*HIGH,CRITICAL/);
    assert.match(packageJson, /"security:deps":\s*"npm audit --audit-level=high"/);
  });

  it('documents patch SLAs by severity', () => {
    assert.match(policy, /Patch SLAs/i);
    assert.match(policy, /7 calendar days/);
    assert.match(policy, /14 calendar days/);
    assert.match(policy, /60 calendar days/);
    assert.match(policy, /48 hours/);
  });

  it('keeps Dependabot SCA updates configured', () => {
    assert.match(dependabot, /package-ecosystem:\s*npm/);
    assert.match(dependabot, /package-ecosystem:\s*github-actions/);
    assert.match(policy, /dependabot\.yml/);
  });
});
