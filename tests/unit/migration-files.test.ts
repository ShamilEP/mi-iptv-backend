import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertUniqueVersions,
  listMigrationFiles,
  listSeedFiles,
} from '../../src/infrastructure/db/migration-files.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('migration-files', () => {
  it('lists versioned migrations in order with checksums', () => {
    const files = listMigrationFiles(join(root, 'db', 'migrations'));
    assertUniqueVersions(files);
    assert.ok(files.length >= 3);
    assert.equal(files[0]?.version, '001');
    assert.equal(files[0]?.fileName, '001_postgres_schema.sql');
    assert.match(files[0]?.checksum ?? '', /^[a-f0-9]{64}$/);
    assert.equal(files[1]?.version, '002');
    assert.equal(
      files[1]?.fileName,
      '002_constraints_indexes_timestamps.sql',
    );
    assert.match(files[1]?.checksum ?? '', /^[a-f0-9]{64}$/);
    assert.equal(files[2]?.version, '003');
    assert.equal(files[2]?.fileName, '003_missing_srs_tables.sql');
    assert.match(files[2]?.checksum ?? '', /^[a-f0-9]{64}$/);
  });

  it('lists DEV and QA seed files', () => {
    const dev = listSeedFiles(join(root, 'db', 'seeds', 'dev'));
    const qa = listSeedFiles(join(root, 'db', 'seeds', 'qa'));
    assert.ok(dev.some((path) => path.endsWith('001_dev_smoke.sql')));
    assert.ok(qa.some((path) => path.endsWith('001_qa_contract.sql')));
  });
});
