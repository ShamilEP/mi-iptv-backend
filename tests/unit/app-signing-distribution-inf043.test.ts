import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('INF-043 app signing and distribution', () => {
  const design = read('docs/infra/043-app-signing-distribution.md');
  const signingReadme = read('.github/signing/README.md');
  const play = read('.github/workflows/distribute-play-internal.yml');
  const testflight = read('.github/workflows/distribute-testflight.yml');
  const beta = read('.github/workflows/distribute-beta.yml');

  it('documents keystore and certificate management without committing material', () => {
    assert.match(design, /Keystore and certificate management/i);
    assert.match(design, /Never commit/i);
    assert.match(signingReadme, /ANDROID_KEYSTORE_BASE64/);
    assert.match(signingReadme, /APPLE_CERTIFICATE_P12_BASE64/);
    assert.match(signingReadme, /Forbidden/i);
    assert.doesNotMatch(signingReadme, /BEGIN PRIVATE KEY/);
    assert.doesNotMatch(design, /"private_key":/);
  });

  it('automates Play Console internal-track uploads', () => {
    assert.match(play, /track:\s*internal/);
    assert.match(play, /PLAY_SERVICE_ACCOUNT_JSON/);
    assert.match(play, /r0adkll\/upload-google-play/);
    assert.match(design, /Play Console/i);
    assert.match(beta, /distribute-play-internal\.yml/);
  });

  it('automates TestFlight on macOS with ASC API secrets', () => {
    assert.match(testflight, /runs-on:\s*macos-latest/);
    assert.match(testflight, /upload-testflight-build/);
    assert.match(testflight, /ASC_APP_ID/);
    assert.match(testflight, /APPLE_API_KEY_P8_BASE64/);
    assert.match(design, /TestFlight/);
    assert.match(beta, /distribute-testflight\.yml/);
  });
});
