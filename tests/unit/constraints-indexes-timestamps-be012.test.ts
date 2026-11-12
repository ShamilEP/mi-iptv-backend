import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const sql001 = readFileSync(
  join(root, 'db', 'migrations', '001_postgres_schema.sql'),
  'utf8',
);
const sql002 = readFileSync(
  join(root, 'db', 'migrations', '002_constraints_indexes_timestamps.sql'),
  'utf8',
);

describe('BE-012 constraints, indexes, and server-side timestamps', () => {
  it('keeps unique email on accounts (001) and guards it in 002', () => {
    const accounts = sql001.slice(sql001.indexOf('CREATE TABLE app.accounts'));
    const end = accounts.indexOf('CREATE TABLE app.profiles');
    const ddl = accounts.slice(0, end > 0 ? end : 1500);
    assert.match(ddl, /email\s+citext\s+NOT NULL\s+UNIQUE/i);
    assert.match(sql002, /uq_accounts_email|accounts_email_key|UNIQUE \(email\)/i);
  });

  it('adds FK cascade / restrict polish for refresh tokens and providers', () => {
    assert.match(
      sql002,
      /fk_refresh_tokens_account[\s\S]*ON DELETE CASCADE/i,
    );
    assert.match(
      sql002,
      /fk_user_sources_provider[\s\S]*ON DELETE RESTRICT/i,
    );
  });

  it('adds delta indexes on updated_at and sync_version for synced tables', () => {
    for (const table of ['playback_states', 'favorites', 'user_sources']) {
      assert.match(
        sql002,
        new RegExp(
          `ix_${table}_delta_updated[\\s\\S]*ON app\\.${table} \\(account_id, updated_at\\)`,
          'i',
        ),
      );
      assert.match(
        sql002,
        new RegExp(
          `ix_${table}_delta_sync_version[\\s\\S]*ON app\\.${table} \\(account_id, sync_version\\)`,
          'i',
        ),
      );
    }
  });

  it('forces created_at and updated_at from the server clock', () => {
    assert.match(sql002, /CREATE OR REPLACE FUNCTION app\.force_row_timestamps/i);
    assert.match(sql002, /NEW\.created_at := clock_timestamp\(\)/i);
    assert.match(sql002, /NEW\.updated_at := clock_timestamp\(\)/i);
    assert.match(sql002, /NEW\.created_at := OLD\.created_at/i);
    assert.match(
      sql002,
      /BEFORE INSERT OR UPDATE ON app\.%1\$I|BEFORE INSERT OR UPDATE ON app\./i,
    );
    for (const table of [
      'accounts',
      'profiles',
      'user_sources',
      'favorites',
      'playback_states',
    ]) {
      assert.match(sql002, new RegExp(`'${table}'`));
    }
  });

  it('keeps change_seq delta indexes from the baseline migration', () => {
    assert.match(
      sql001,
      /CREATE INDEX ix_playback_delta\s+ON app\.playback_states \(account_id, change_seq\)/i,
    );
    assert.match(
      sql001,
      /CREATE INDEX ix_favorites_delta ON app\.favorites \(account_id, change_seq\)/i,
    );
    assert.match(
      sql001,
      /CREATE INDEX ix_user_sources_delta ON app\.user_sources \(account_id, change_seq\)/i,
    );
  });
});
