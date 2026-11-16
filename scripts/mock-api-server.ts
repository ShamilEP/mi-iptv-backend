/**
 * Generated-style mock HTTP server driven by `openapi/openapi.json` (BE-004).
 * Returns schema-derived example bodies for the first 2xx response per operation.
 *
 *   npm run mock:api
 *   → http://localhost:4011
 *
 * WSS `/realtime` is not upgraded here; returns a JSON capability note.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { isDirectRun } from './openapi/is-direct-run.js';
import { listOpenApiOperations } from './openapi/list-operations.js';
import { loadOpenApiDocument } from './openapi/load-openapi.js';
import { matchOpenApiPath } from './openapi/match-path.js';
import { pickSuccessMockResponse } from './openapi/pick-success-response.js';
import type { HttpMethod, OpenApiDocument } from './openapi/types.js';
import { HTTP_METHODS } from './openapi/types.js';

const DEFAULT_PORT = 4011;

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers':
    'authorization, content-type, x-account-id, x-device-id, x-profile-id, x-trace-id',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
} as const;

type Route = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly operationId: string;
};

export function createOpenApiMockListener(
  doc: OpenApiDocument = loadOpenApiDocument(),
): (req: IncomingMessage, res: ServerResponse) => void {
  const routes: readonly Route[] = listOpenApiOperations(doc).map((op) => ({
    method: op.method,
    path: op.path,
    operationId: op.operationId,
  }));
  return (req, res) => {
    void handle(req, res, doc, routes);
  };
}

function main(): void {
  const port = Number(process.env.API_MOCK_PORT ?? DEFAULT_PORT);
  const doc = loadOpenApiDocument();
  const routes = listOpenApiOperations(doc);
  const server = createServer(createOpenApiMockListener(doc));

  server.listen(port, () => {
    console.log(`OpenAPI mock API: http://localhost:${port}`);
    console.log(`Operations mocked: ${routes.length}`);
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  doc: OpenApiDocument,
  routes: readonly Route[],
): Promise<void> {
  const method = (req.method ?? 'GET').toLowerCase() as HttpMethod;
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...CORS_HEADERS });
    res.end();
    return;
  }

  if (!HTTP_METHODS.includes(method)) {
    writeJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  const matched = routes
    .filter((route) => route.method === method)
    .map((route) => {
      const pathMatch = matchOpenApiPath(route.path, url.pathname);
      return pathMatch ? { route, pathMatch } : null;
    })
    .find((entry) => entry !== null);

  if (!matched) {
    writeJson(res, 404, {
      error: 'Not Found',
      message: 'No OpenAPI operation matches this method/path',
    });
    return;
  }

  await readBody(req);

  if (matched.route.path === '/realtime' && matched.route.method === 'get') {
    writeJson(res, 200, {
      mock: true,
      operationId: matched.route.operationId,
      message:
        'HTTP mock does not perform WSS upgrade. Point realtime clients at a live backend or a WS mock.',
      params: matched.pathMatch.params,
    });
    return;
  }

  const operation =
    doc.paths?.[matched.route.path]?.[matched.route.method] ?? {};
  const mock = pickSuccessMockResponse(doc, operation);
  if (mock.body === undefined) {
    res.writeHead(mock.status, { ...CORS_HEADERS });
    res.end();
    return;
  }
  const contentType = mock.contentType ?? 'application/json';
  res.writeHead(mock.status, {
    ...CORS_HEADERS,
    'content-type': `${contentType}; charset=utf-8`,
  });
  res.end(
    typeof mock.body === 'string' ? mock.body : JSON.stringify(mock.body, null, 2),
  );
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    ...CORS_HEADERS,
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(body, null, 2));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

if (isDirectRun(import.meta.url)) {
  main();
}
