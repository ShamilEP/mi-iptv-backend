import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('INF-041 build and package workflows', () => {
  const orchestrator = read('.github/workflows/build-package.yml');
  const docker = read('.github/workflows/container-image.yml');
  const androidTv = read('.github/workflows/package-android-tv.yml');
  const companion = read('.github/workflows/package-companion.yml');
  const design = read('docs/infra/041-build-package-workflows.md');

  it('packages Docker images via reusable container-image workflow', () => {
    assert.match(docker, /workflow_call:/);
    assert.match(orchestrator, /uses:\s*\.\/\.github\/workflows\/container-image\.yml/);
    assert.match(design, /Docker images/i);
  });

  it('defines Android TV APK and AAB packaging', () => {
    assert.match(androidTv, /assembleRelease/);
    assert.match(androidTv, /bundleRelease/);
    assert.match(androidTv, /ANDROID_KEYSTORE_BASE64/);
    assert.match(orchestrator, /package-android-tv\.yml/);
    assert.match(design, /Android TV/i);
  });

  it('defines companion AAB and IPA with macOS runners and signing names', () => {
    assert.match(companion, /package-aab:/);
    assert.match(companion, /package-ipa:/);
    assert.match(companion, /runs-on:\s*macos-latest/);
    assert.match(companion, /APPLE_CERTIFICATE_P12_BASE64/);
    assert.match(companion, /APPLE_PROVISIONING_PROFILE_BASE64/);
    assert.match(orchestrator, /package-companion\.yml/);
    assert.match(design, /macOS/i);
    assert.match(design, /IPA/i);
  });
});
