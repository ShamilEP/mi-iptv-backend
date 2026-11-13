import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PERSONAL_DATA_FIELD_NAMES,
  isPersonalDataFieldName,
} from '../../src/domain/privacy/personal-data-fields.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('SEC-040 data inventory and minimization', () => {
  const inventory = read('docs/security/040-data-inventory-and-minimization.md');
  const schema = read('db/migrations/001_postgres_schema.sql');
  const openapi = read('openapi/openapi.json');
  const deviceView = read('src/application/devices/device-public-view.ts');

  it('treats email as the only personal data field', () => {
    assert.deepEqual([...PERSONAL_DATA_FIELD_NAMES], ['email']);
    assert.equal(isPersonalDataFieldName('email'), true);
    assert.equal(isPersonalDataFieldName('phone'), false);
    assert.equal(isPersonalDataFieldName('pushToken'), false);
    assert.equal(isPersonalDataFieldName('name'), false);
    assert.match(inventory, /Sole personal data|only personal data/i);
    assert.match(inventory, /accounts\.email/);
  });

  it('maps client and backend collected fields in the inventory', () => {
    assert.match(inventory, /Client → backend collection map/);
    assert.match(inventory, /POST \/auth\/login/);
    assert.match(inventory, /POST \/devices\/register/);
    assert.match(inventory, /Sources create/);
    assert.match(inventory, /uriRef/);
    assert.match(inventory, /priority/);
    assert.match(inventory, /enabled/);
    assert.match(inventory, /forceReset/);
    assert.match(inventory, /completed/);
    assert.match(inventory, /clientReportedAt/);
    assert.match(inventory, /allDevices/);
    assert.match(inventory, /Sync playback/);
    assert.match(inventory, /Sync favorites/);
    assert.match(inventory, /Backend persistence inventory/);
    assert.match(inventory, /favorites/);
    assert.match(inventory, /profile_settings|profile settings/i);
    assert.match(inventory, /device_commands/);
    assert.match(inventory, /email_verified_at/);
    assert.match(inventory, /profiles\.name.*region|region/);
    assert.match(openapi, /"LoginRequest"/);
    assert.match(openapi, /"email"/);
    assert.match(schema, /email\s+citext\s+NOT NULL UNIQUE/);
    assert.match(schema, /CREATE TABLE app\.device_commands/);
  });

  it('does not collect phone/address/DOB and never returns push tokens', () => {
    assert.match(inventory, /Explicitly \*\*not\*\* collected/i);
    assert.doesNotMatch(schema, /CREATE TABLE app\.accounts[\s\S]*?\bphone\b/);
    assert.doesNotMatch(schema, /\bdate_of_birth\b|\bpostal_address\b|\bssn\b/i);
    assert.match(deviceView, /pushTokenConfigured/);
    assert.doesNotMatch(deviceView, /pushToken:/);
  });
});
