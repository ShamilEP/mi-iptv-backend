import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertXtreamAccountUsable,
  classifyXtreamAccountStatus,
} from '../../src/domain/catalog/xtream-account-status.js';
import { XtreamError } from '../../src/domain/catalog/xtream-error.js';

describe('assertXtreamAccountUsable', () => {
  it('accepts active authenticated accounts', () => {
    assert.doesNotThrow(() =>
      assertXtreamAccountUsable({
        auth: 1,
        status: 'Active',
        expDate: String(Math.floor(Date.now() / 1000) + 86_400),
      }),
    );
    assert.equal(
      classifyXtreamAccountStatus({
        auth: 1,
        status: 'Active',
        expDate: null,
      }),
      'active',
    );
  });

  it('rejects auth failures', () => {
    assert.throws(
      () =>
        assertXtreamAccountUsable({
          auth: 0,
          status: 'Active',
          expDate: null,
        }),
      (error: unknown) =>
        error instanceof XtreamError && error.code === 'XTREAM_AUTH_FAILED',
    );
  });

  it('rejects expired and blocked accounts', () => {
    assert.throws(
      () =>
        assertXtreamAccountUsable({
          auth: 1,
          status: 'Expired',
          expDate: null,
        }),
      (error: unknown) =>
        error instanceof XtreamError && error.code === 'XTREAM_ACCOUNT_EXPIRED',
    );
    assert.throws(
      () =>
        assertXtreamAccountUsable({
          auth: 1,
          status: 'Banned',
          expDate: null,
        }),
      (error: unknown) =>
        error instanceof XtreamError && error.code === 'XTREAM_ACCOUNT_BLOCKED',
    );
  });
});
