import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPgPoolRelationalDatabaseFromEnv } from '../../src/infrastructure/persistence/pg-pool-relational-database.js';

describe('PgPoolRelationalDatabase factory', () => {
  it('returns null when DATABASE_URL is missing', () => {
    assert.equal(createPgPoolRelationalDatabaseFromEnv({}), null);
    assert.equal(
      createPgPoolRelationalDatabaseFromEnv({ DATABASE_URL: '   ' }),
      null,
    );
  });

  it('builds a pool adapter when DATABASE_URL is set', async () => {
    const db = createPgPoolRelationalDatabaseFromEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/mi_iptv',
    });
    assert.ok(db !== null);
    await db.close();
  });
});
