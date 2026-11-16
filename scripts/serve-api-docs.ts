/**
 * Serves Swagger UI + the frozen OpenAPI document (BE-004).
 *
 *   npm run docs:api
 *   → http://localhost:4010/docs
 *   → http://localhost:4010/openapi.json
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDirectRun } from './openapi/is-direct-run.js';
import { openApiDocumentPath, repoRoot } from './openapi/load-openapi.js';

const DEFAULT_PORT = 4010;

function main(): void {
  const port = Number(process.env.API_DOCS_PORT ?? DEFAULT_PORT);
  const openApiJson = readFileSync(openApiDocumentPath());
  const docsHtml = readFileSync(join(repoRoot(), 'docs', 'api', 'index.html'));

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    if (path === '/' || path === '/docs' || path === '/docs/') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(docsHtml);
      return;
    }
    if (path === '/openapi.json') {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      });
      res.end(openApiJson);
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  server.listen(port, () => {
    console.log(`API docs (Swagger UI): http://localhost:${port}/docs`);
    console.log(`OpenAPI JSON:          http://localhost:${port}/openapi.json`);
  });
}

if (isDirectRun(import.meta.url)) {
  main();
}
