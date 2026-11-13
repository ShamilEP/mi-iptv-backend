import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('INF-054 anonymous crash reporting (TV + companion)', () => {
  const design = read('docs/infra/054-crash-reporting.md');
  const ops = read('.github/crash-reporting/README.md');
  const secretsDoc = read('docs/infra/013-config-secrets-kms.md');
  const catalog = JSON.parse(
    read('docs/infra/crash-reporting-projects.json'),
  ) as {
    provider: string;
    anonymity: {
      allowedIdentifiers: string[];
      forbiddenIdentifiers: string[];
    };
    apps: {
      androidTv: { packageName: string };
      companionAndroid: { packageName: string };
      companionIos: { bundleId: string };
    };
    environments: Record<string, { firebaseProjectId: string }>;
    secretNames: Record<string, string>;
  };

  it('defines anonymous Crashlytics for the TV app', () => {
    assert.equal(catalog.provider, 'firebase-crashlytics');
    assert.equal(catalog.apps.androidTv.packageName, 'com.miiptv.tv');
    assert.match(design, /Android TV/i);
    assert.match(design, /com\.miiptv\.tv/);
    assert.ok(
      catalog.anonymity.allowedIdentifiers.includes('anonymousSessionId'),
    );
    assert.ok(catalog.anonymity.forbiddenIdentifiers.includes('email'));
    assert.ok(catalog.anonymity.forbiddenIdentifiers.includes('accountId'));
    assert.match(design, /Anonymous/i);
    assert.match(ops, /Anonymity checklist/i);
  });

  it('defines anonymous Crashlytics for the companion (Android + iOS)', () => {
    assert.equal(catalog.apps.companionAndroid.packageName, 'com.miiptv.companion');
    assert.equal(catalog.apps.companionIos.bundleId, 'com.miiptv.companion');
    assert.match(design, /companion/i);
    assert.match(design, /iOS/);
    for (const env of ['dev', 'qa', 'prod']) {
      assert.ok(
        catalog.environments[env]?.firebaseProjectId.includes('mi-iptv-companion'),
      );
    }
    assert.equal(
      catalog.secretNames.firebaseCiServiceAccountJson,
      'FIREBASE_CRASHLYTICS_CI_SERVICE_ACCOUNT_JSON',
    );
    assert.match(secretsDoc, /FIREBASE_CRASHLYTICS_CI_SERVICE_ACCOUNT_JSON/);
    assert.match(ops, /FIREBASE_APP_ID_TV/);
    assert.match(ops, /FIREBASE_APP_ID_COMPANION_ANDROID/);
    assert.match(ops, /FIREBASE_APP_ID_COMPANION_IOS/);
    assert.doesNotMatch(ops, /BEGIN PRIVATE KEY/);
    assert.doesNotMatch(design, /"private_key":/);
  });
});
