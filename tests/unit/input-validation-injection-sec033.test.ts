import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseExtInfLine } from '../../src/domain/catalog/parse-extinf.js';
import { normalizeDisplayText } from '../../src/domain/catalog/display-text.js';
import { SsrfGuardError } from '../../src/domain/sources/ssrf-guard-error.js';
import { buildSourceRegistryApi } from '../helpers/source-use-cases.js';

const accountId = '33333333-3333-4333-8333-333333333333';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Input validation and injection (SEC-033)', () => {
  it('rejects SSRF targets on source create before persist', async () => {
    const api = buildSourceRegistryApi();
    await assert.rejects(
      () =>
        api.create.execute({
          accountId,
          kind: 'm3u',
          name: 'IMDS',
          uriRef: 'http://169.254.169.254/latest/meta-data/',
        }),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        (error.code === 'SOURCE_URL_ADDRESS_BLOCKED' ||
          error.code === 'SOURCE_URL_HOST_BLOCKED'),
    );
    assert.equal((await api.list.execute(accountId)).length, 0);

    await assert.rejects(
      () =>
        api.create.execute({
          accountId,
          kind: 'm3u',
          name: 'Private',
          uriRef: 'http://10.0.0.8/playlist.m3u',
        }),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });

  it('rejects SSRF targets when updating uriRef', async () => {
    const api = buildSourceRegistryApi();
    const created = await api.create.execute({
      accountId,
      kind: 'm3u',
      name: 'Ok',
      uriRef: 'https://cdn.example.com/list.m3u',
    });
    await assert.rejects(
      () =>
        api.update.execute({
          accountId,
          sourceId: created.id,
          uriRef: 'http://127.0.0.1/playlist.m3u',
        }),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });

  it('normalizes channel/title display text (NUL, bidi, controls)', () => {
    assert.equal(
      normalizeDisplayText('  News\u0000\u202Eevil\u202C  '),
      'News evil',
    );
    const parsed = parseExtInfLine(
      '#EXTINF:-1 tvg-name="A\u0000B",Live\u202EChannel',
    );
    assert.ok(parsed);
    assert.equal(parsed.title.includes('\u0000'), false);
    assert.equal(parsed.title.includes('\u202E'), false);
  });

  it('documents parameterized SQL adapter and forbids shell exec in tooling', () => {
    const pgAdapter = readFileSync(
      join(root, 'src/infrastructure/persistence/pg-pool-relational-database.ts'),
      'utf8',
    );
    assert.match(
      pgAdapter,
      /values === undefined \? undefined : \[\.\.\.values\]/,
    );
    assert.match(pgAdapter, /(?:pool|client)\.query\(/);
    assert.doesNotMatch(pgAdapter, /shell:\s*true/);

    const scriptDirs = ['scripts', 'src'];
    for (const dir of scriptDirs) {
      walkTs(join(root, dir), (file, source) => {
        assert.doesNotMatch(
          source,
          /(?<!\.)\bexec(?:Sync|File|FileSync)?\s*\(/,
          `${file} must not use child_process.exec*`,
        );
        assert.doesNotMatch(
          source,
          /shell:\s*true/,
          `${file} must not enable shell`,
        );
      });
    }

    const migrate = readFileSync(join(root, 'scripts/db-migrate.ts'), 'utf8');
    assert.match(migrate, /spawnSync\(\s*'psql'/);
  });
});

function walkTs(
  dir: string,
  visit: (file: string, source: string) => void,
): void {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === 'node_modules' || name.name === 'dist') {
        continue;
      }
      walkTs(path, visit);
      continue;
    }
    if (!name.name.endsWith('.ts')) {
      continue;
    }
    visit(path, readFileSync(path, 'utf8'));
  }
}
