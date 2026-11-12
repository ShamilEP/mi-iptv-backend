import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchRoutePath } from '../../src/presentation/http/match-route-path.js';

describe('matchRoutePath', () => {
  it('extracts path params for source id routes', () => {
    const match = matchRoutePath(
      '/api/v1/sources/{id}',
      '/api/v1/sources/abc-123',
    );
    assert.deepEqual(match, { params: { id: 'abc-123' } });
  });

  it('returns null when segments diverge', () => {
    assert.equal(matchRoutePath('/api/v1/sources', '/api/v1/catalog'), null);
  });
});
