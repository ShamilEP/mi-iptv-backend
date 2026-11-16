/**
 * Combined Swagger UI + OpenAPI mock on one port (INF-045 hosting).
 *
 *   npm run contract:serve
 *   → http://localhost:8080/docs
 *   → http://localhost:8080/openapi.json
 *   → http://localhost:8080/health (and all MVP mock paths)
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDirectRun } from './openapi/is-direct-run.js';
import { openApiDocumentPath, repoRoot } from './openapi/load-openapi.js';
import { createOpenApiMockListener } from './mock-api-server.js';

const DEFAULT_PORT = 8080;

export function createContractStackListener(): (
  req: IncomingMessage,
  res: ServerResponse,
) => void {
  const openApiJson = readFileSync(openApiDocumentPath());
  const docsHtml = readFileSync(join(repoRoot(), 'docs', 'api', 'index.html'));
  const mock = createOpenApiMockListener();

  return (req, res) => {
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
    mock(req, res);
  };
}

function main(): void {
  const port = Number(
    process.env.PORT ?? process.env.API_CONTRACT_PORT ?? DEFAULT_PORT,
  );
  const server = createServer(createContractStackListener());
  server.listen(port, () => {
    console.log(`Contract stack (docs + mock): http://localhost:${port}/docs`);
    console.log(
      `OpenAPI JSON:                 http://localhost:${port}/openapi.json`,
    );
    console.log(`Mock API base:                http://localhost:${port}`);
  });
}

if (isDirectRun(import.meta.url)) {
  main();
}
