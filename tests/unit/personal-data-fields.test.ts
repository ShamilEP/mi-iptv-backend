import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PERSONAL_DATA_FIELD_NAMES,
  isPersonalDataFieldName,
} from '../../src/domain/privacy/personal-data-fields.js';

describe('personal data fields (SEC-040 / Security §6)', () => {
  it('lists only email', () => {
    assert.equal(PERSONAL_DATA_FIELD_NAMES.length, 1);
    assert.equal(PERSONAL_DATA_FIELD_NAMES[0], 'email');
  });

  it('recognizes email and rejects other names', () => {
    assert.equal(isPersonalDataFieldName('email'), true);
    assert.equal(isPersonalDataFieldName('Email'), false);
    assert.equal(isPersonalDataFieldName('password'), false);
  });
});
