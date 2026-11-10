import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GetHealthStatus } from '../../src/application/health/get-health-status.js';

describe('GetHealthStatus', () => {
  it('returns ok status', () => {
    const useCase = new GetHealthStatus();
    assert.equal(useCase.execute().status, 'ok');
  });
});
