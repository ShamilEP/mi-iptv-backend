import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('INF-034 push notification services (FCM / APNs)', () => {
  const design = read('docs/infra/034-push-notification-services.md');
  const ops = read('.github/push/README.md');
  const secretsDoc = read('docs/infra/013-config-secrets-kms.md');
  const catalog = JSON.parse(
    read('docs/infra/push-notification-projects.json'),
  ) as {
    companion: { androidPackageName: string; iosBundleId: string };
    environments: Record<
      string,
      {
        fcmProjectId: string;
        apnsKeyId: string;
        apnsTeamId: string;
        apnsTopic: string;
      }
    >;
    secretNames: Record<string, string>;
  };

  it('defines an FCM project catalog for the companion', () => {
    assert.match(design, /Firebase Cloud Messaging \(FCM\)/i);
    assert.match(design, /mi-iptv-companion-dev/);
    assert.equal(catalog.companion.androidPackageName, 'com.miiptv.companion');
    for (const env of ['dev', 'qa', 'prod']) {
      assert.ok(catalog.environments[env]?.fcmProjectId.includes('mi-iptv-companion'));
    }
    assert.equal(
      catalog.secretNames.fcmServiceAccountJson,
      'FCM_SERVICE_ACCOUNT_JSON',
    );
    assert.match(secretsDoc, /FCM_SERVICE_ACCOUNT_JSON/);
    assert.match(ops, /FCM_SERVICE_ACCOUNT_JSON/);
  });

  it('defines APNs Auth Key secret names for the companion', () => {
    assert.match(design, /APNs Auth Key/i);
    assert.match(design, /APNS_AUTH_KEY_P8_BASE64/);
    assert.match(design, /APNS_KEY_ID/);
    assert.match(design, /APNS_TEAM_ID/);
    assert.equal(catalog.companion.iosBundleId, 'com.miiptv.companion');
    assert.equal(catalog.secretNames.apnsAuthKeyP8Base64, 'APNS_AUTH_KEY_P8_BASE64');
    assert.equal(catalog.secretNames.apnsKeyId, 'APNS_KEY_ID');
    assert.equal(catalog.secretNames.apnsTeamId, 'APNS_TEAM_ID');
    assert.equal(catalog.secretNames.apnsTopic, 'APNS_TOPIC');
    for (const env of ['dev', 'qa', 'prod']) {
      assert.equal(catalog.environments[env]?.apnsTopic, 'com.miiptv.companion');
      assert.ok(catalog.environments[env]?.apnsKeyId);
      assert.ok(catalog.environments[env]?.apnsTeamId);
    }
    assert.match(secretsDoc, /APNS_AUTH_KEY_P8_BASE64/);
    assert.match(ops, /Forbidden/i);
    assert.doesNotMatch(ops, /BEGIN PRIVATE KEY/);
    assert.doesNotMatch(design, /"private_key":/);
  });
});
