import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type MigrationFile = {
  readonly version: string;
  readonly fileName: string;
  readonly absolutePath: string;
  readonly checksum: string;
  readonly sql: string;
};

const MIGRATION_NAME = /^(\d{3})_[a-z0-9][a-z0-9_-]*\.sql$/i;

export function listMigrationFiles(migrationsDir: string): MigrationFile[] {
  const names = readdirSync(migrationsDir)
    .filter((name) => MIGRATION_NAME.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'));

  return names.map((fileName) => {
    const absolutePath = join(migrationsDir, fileName);
    const sql = readFileSync(absolutePath, 'utf8');
    const version = fileName.slice(0, 3);
    return {
      version,
      fileName,
      absolutePath,
      checksum: sha256(sql),
      sql,
    };
  });
}

export function listSeedFiles(seedsDir: string): string[] {
  return readdirSync(seedsDir)
    .filter((name) => /^\d{3}_.+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((name) => join(seedsDir, name));
}

export function assertUniqueVersions(files: readonly MigrationFile[]): void {
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.version)) {
      throw new Error(`Duplicate migration version ${file.version}`);
    }
    seen.add(file.version);
  }
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
