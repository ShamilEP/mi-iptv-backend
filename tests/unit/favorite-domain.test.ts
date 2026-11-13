import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isFavoriteAction,
  isFavoriteType,
} from '../../src/domain/sync/favorite.js';

describe('favorite domain helpers (BE-120 normalizers)', () => {
  it('accepts only add|remove actions and channel|vod types', () => {
    assert.equal(isFavoriteAction('add'), true);
    assert.equal(isFavoriteAction('remove'), true);
    assert.equal(isFavoriteAction('update'), false);
    assert.equal(isFavoriteType('channel'), true);
    assert.equal(isFavoriteType('vod'), true);
    assert.equal(isFavoriteType('series'), false);
  });
});
