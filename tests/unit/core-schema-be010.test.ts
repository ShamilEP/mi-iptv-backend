import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const sql = readFileSync(
  join(root, 'db', 'migrations', '001_postgres_schema.sql'),
  'utf8',
);

describe('BE-010 core schema (Backend §5.1)', () => {
  it('defines accounts, devices, profiles, playback_states, and user_sources', () => {
    for (const table of [
      'accounts',
      'devices',
      'profiles',
      'playback_states',
      'user_sources',
    ]) {
      assert.match(sql, new RegExp(`CREATE TABLE app\\.${table}\\s*\\(`));
    }
  });

  it('uses PRIMARY KEY (profile_id, content_id) on playback_states', () => {
    const block = sql.slice(sql.indexOf('CREATE TABLE app.playback_states'));
    const end = block.indexOf('WITH (fillfactor');
    const ddl = block.slice(0, end > 0 ? end : 2500);
    assert.match(ddl, /PRIMARY KEY\s*\(\s*profile_id\s*,\s*content_id\s*\)/);
  });

  it('stores user_sources credentials as credentials_encrypted BYTEA with uri_ref', () => {
    const block = sql.slice(sql.indexOf('CREATE TABLE app.user_sources'));
    const end = block.indexOf('CREATE UNIQUE INDEX');
    const ddl = block.slice(0, end > 0 ? end : 2500);
    assert.match(ddl, /credentials_encrypted\s+bytea/i);
    assert.match(ddl, /\buri_ref\s+text\b/i);
    assert.match(ddl, /\bkind\s+text\b/i);
    assert.match(ddl, /\bpriority\s+int\b/i);
    assert.doesNotMatch(ddl, /\bcredentials_enc\b/);
    assert.doesNotMatch(sql, /CREATE TABLE app\.sources\s*\(/);
  });
});
