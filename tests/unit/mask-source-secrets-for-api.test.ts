import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { maskSourceSecretsForApi } from '../../src/application/sources/mask-source-secrets-for-api.js';

describe('maskSourceSecretsForApi', () => {
  it('never returns username, password, or token values', () => {
    const view = maskSourceSecretsForApi({ credentialsConfigured: true });
    assert.deepEqual(view, {
      credentialsConfigured: true,
      username: null,
      password: null,
      token: null,
    });
  });

  it('reports when credentials are not configured', () => {
    const view = maskSourceSecretsForApi({ credentialsConfigured: false });
    assert.equal(view.credentialsConfigured, false);
    assert.equal(view.password, null);
  });
});
