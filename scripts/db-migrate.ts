import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertUniqueVersions,
  listMigrationFiles,
} from '../src/infrastructure/db/migration-files.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'db', 'migrations');

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     text PRIMARY KEY,
  file_name   text NOT NULL,
  checksum    text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
`;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to run migrations');
  }
  return url;
}

function runPsql(databaseUrl: string, args: string[], input?: string): string {
  const result = spawnSync(
    'psql',
    ['--dbname', databaseUrl, '-v', 'ON_ERROR_STOP=1', ...args],
    {
      input,
      encoding: 'utf8',
      env: process.env,
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n');
    throw new Error(`psql failed (exit ${result.status}): ${detail}`);
  }
  return result.stdout ?? '';
}

function appliedMigrations(databaseUrl: string): Map<string, string> {
  const out = runPsql(databaseUrl, [
    '-At',
    '-c',
    "SELECT version || E'\\t' || checksum FROM public.schema_migrations ORDER BY version",
  ]);
  const map = new Map<string, string>();
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [version, checksum] = trimmed.split('\t');
    if (version && checksum) {
      map.set(version, checksum);
    }
  }
  return map;
}

function main(): void {
  const databaseUrl = requireDatabaseUrl();
  const files = listMigrationFiles(migrationsDir);
  assertUniqueVersions(files);

  runPsql(databaseUrl, ['-c', BOOTSTRAP_SQL]);
  const applied = appliedMigrations(databaseUrl);

  let appliedCount = 0;
  for (const file of files) {
    const existing = applied.get(file.version);
    if (existing) {
      if (existing !== file.checksum) {
        throw new Error(
          `Migration ${file.fileName} checksum mismatch (DB=${existing}, file=${file.checksum})`,
        );
      }
      console.log(`skip  ${file.fileName}`);
      continue;
    }

    console.log(`apply ${file.fileName}`);
    // One transaction per file: DDL + ledger row succeed or roll back together.
    const wrapped = `
BEGIN;
${file.sql}
INSERT INTO public.schema_migrations (version, file_name, checksum)
VALUES ('${file.version}', '${file.fileName.replace(/'/g, "''")}', '${file.checksum}');
COMMIT;
`;
    runPsql(databaseUrl, ['-f', '-'], wrapped);
    appliedCount += 1;
  }

  console.log(
    `Migrations complete (${appliedCount} applied, ${files.length - appliedCount} already present).`,
  );
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
