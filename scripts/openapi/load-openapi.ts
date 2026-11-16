import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OpenApiDocument } from './types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function openApiDocumentPath(): string {
  return join(root, 'openapi', 'openapi.json');
}

export function repoRoot(): string {
  return root;
}

export function loadOpenApiDocument(
  path: string = openApiDocumentPath(),
): OpenApiDocument {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as OpenApiDocument;
}
