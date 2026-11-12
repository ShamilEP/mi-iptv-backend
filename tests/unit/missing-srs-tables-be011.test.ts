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
const sql003 = readFileSync(
  join(root, 'db', 'migrations', '003_missing_srs_tables.sql'),
  'utf8',
);

describe('BE-011 missing SRS §6 tables', () => {
  it('keeps favorites core columns and adds type in 003', () => {
    const block = sql001.slice(sql001.indexOf('CREATE TABLE app.favorites'));
    const end = block.indexOf('CREATE TABLE app.playback_states');
    const ddl = block.slice(0, end > 0 ? end : 2000);
    assert.match(ddl, /profile_id/);
    assert.match(ddl, /item_id/);
    assert.match(ddl, /sort_order/);
    assert.match(ddl, /sync_version/);
    assert.match(ddl, /updated_at/);
    assert.match(sql003, /ADD COLUMN IF NOT EXISTS type text/i);
    assert.match(sql003, /CHECK \(type IN \('channel', 'vod'\)\)/i);
  });

  it('creates syncable profile_settings', () => {
    assert.match(sql003, /CREATE TABLE IF NOT EXISTS app\.profile_settings/i);
    assert.match(sql003, /\bpayload\s+jsonb\b/i);
    assert.match(sql003, /\bsync_version\s+int\b/i);
    assert.match(sql003, /\bchange_seq\s+bigint\b/i);
    assert.match(sql003, /\bupdated_at\s+timestamptz\b/i);
  });

  it('exposes sync_log as a view over sync_events', () => {
    assert.match(sql001, /CREATE TABLE app\.sync_events/i);
    assert.match(sql003, /CREATE OR REPLACE VIEW app\.sync_log AS/i);
    assert.match(sql003, /FROM app\.sync_events/i);
  });

  it('retains password_reset_tokens and refresh_tokens from baseline', () => {
    assert.match(sql001, /CREATE TABLE app\.password_reset_tokens/i);
    assert.match(sql001, /CREATE TABLE app\.refresh_tokens/i);
    assert.match(sql001, /\btoken_hash\s+bytea\b/i);
    assert.match(sql001, /\bfamily_id\s+uuid\b/i);
    assert.match(sql003, /COMMENT ON TABLE app\.password_reset_tokens/i);
    assert.match(sql003, /COMMENT ON TABLE app\.refresh_tokens/i);
  });
});
