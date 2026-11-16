import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CHILD_DATA_NOT_COLLECTED,
  isForbiddenChildDataField,
  PARENTAL_CONTROL_FIELD_NAMES,
} from '../../src/domain/privacy/child-data-policy.js';
import { PERSONAL_DATA_FIELD_NAMES } from '../../src/domain/privacy/personal-data-fields.js';
import { toProfilePublicView } from '../../src/application/profiles/profile-public-view.js';
import {
  redactLogFields,
  isSensitiveFieldName,
} from '../../src/infrastructure/logging/redact-log-fields.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('SEC-044 children data handling review', () => {
  const review = read('docs/security/044-childrens-data-handling-review.md');
  const schema001 = read('db/migrations/001_postgres_schema.sql');
  const schema004 = read('db/migrations/004_profile_pin_parental.sql');
  const publicView = read('src/application/profiles/profile-public-view.ts');
  const setPin = read('src/application/profiles/set-parental-pin.ts');
  const verifyPin = read('src/application/profiles/verify-parental-pin.ts');
  const restrictions = read('src/domain/profiles/parental-restrictions.ts');

  it('records enablement verdict and forbids child identity fields', () => {
    assert.match(review, /Conditionally yes|conditionally yes/i);
    assert.match(review, /No child PII|no child PII|Collect children's personal data\?/i);
    assert.ok(CHILD_DATA_NOT_COLLECTED.includes('dateOfBirth'));
    assert.ok(CHILD_DATA_NOT_COLLECTED.includes('age'));
    assert.equal(isForbiddenChildDataField('dateOfBirth'), true);
    assert.equal(isForbiddenChildDataField('kidMode'), false);
    assert.deepEqual([...PERSONAL_DATA_FIELD_NAMES], ['email']);
    assert.doesNotMatch(schema001, /\bdate_of_birth\b|\bchild_email\b|\bage\b\s+/i);
    assert.doesNotMatch(schema004, /\bdate_of_birth\b|\bchild_email\b/i);
  });

  it('keeps parental PIN hashed and never exposes hash on public views', () => {
    assert.match(setPin, /hashOpaque/);
    assert.match(verifyPin, /ParentalPinThrottle|throttle/);
    assert.match(schema004, /pin_hash/);
    assert.match(publicView, /pinConfigured/);
    assert.doesNotMatch(publicView, /pinHash:/);
    assert.ok(PARENTAL_CONTROL_FIELD_NAMES.includes('pinHash'));

    const view = toProfilePublicView({
      id: 'p1',
      accountId: 'a1',
      name: 'Kids',
      avatar: null,
      language: 'es',
      region: null,
      isDefault: false,
      autoplay: true,
      subtitlePrefs: {},
      restrictions: { kidMode: true, maxRating: 'PG' },
      pinHash: '$argon2id$v=19$m=65536,t=3,p=1$secret',
      historyEnabled: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    assert.equal(view.pinConfigured, true);
    assert.equal(view.restrictions.kidMode, true);
    assert.equal(
      Object.prototype.hasOwnProperty.call(view, 'pinHash'),
      false,
    );
  });

  it('documents content gates and redacts clear PIN fields in logs', () => {
    assert.match(restrictions, /evaluateContentAccess/);
    assert.match(restrictions, /kidMode/);
    assert.match(review, /EvaluateContentForProfile/);
    assert.equal(isSensitiveFieldName('pin'), true);
    assert.equal(isSensitiveFieldName('currentPin'), true);
    const redacted = redactLogFields({
      pin: '1234',
      currentPin: '5678',
      profileId: 'p1',
    });
    assert.equal(redacted.pin, '[REDACTED]');
    assert.equal(redacted.currentPin, '[REDACTED]');
    assert.equal(redacted.profileId, 'p1');
  });
});
