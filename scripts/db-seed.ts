import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSeedFiles } from '../src/infrastructure/db/migration-files.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to run seeds');
  }
  return url;
}

function resolveSeedEnv(): 'dev' | 'qa' {
  const raw = (process.env.APP_ENV ?? process.env.SEED_ENV ?? '').toLowerCase();
  if (raw === 'prod' && process.env.ALLOW_PROD_SEED !== '1') {
    throw new Error('Refusing to seed prod without ALLOW_PROD_SEED=1');
  }
  if (raw === 'dev' || raw === 'qa') {
    return raw;
  }
  throw new Error('Set APP_ENV (or SEED_ENV) to dev or qa to run seeds');
}

function runPsqlFile(databaseUrl: string, filePath: string): void {
  const result = spawnSync(
    'psql',
    ['--dbname', databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', filePath],
    { encoding: 'utf8', env: process.env },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n');
    throw new Error(`psql failed for ${filePath}: ${detail}`);
  }
}

function main(): void {
  const databaseUrl = requireDatabaseUrl();
  const seedEnv = resolveSeedEnv();
  const seedsDir = join(root, 'db', 'seeds', seedEnv);
  const files = listSeedFiles(seedsDir);
  if (files.length === 0) {
    throw new Error(`No seed files found in ${seedsDir}`);
  }

  for (const file of files) {
    console.log(`seed  ${seedEnv}/${file.split(/[/\\]/).pop()}`);
    runPsqlFile(databaseUrl, file);
  }
  console.log(`Seeds complete for ${seedEnv} (${files.length} file(s)).`);
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
