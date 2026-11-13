import http from 'node:http';
import { URL } from 'node:url';
import type {
  HttpRequest,
  HttpRoute,
  HttpServer,
} from '../../application/ports/http-server.js';
import type { Logger } from '../../application/ports/logger.js';
import { resolveTraceId } from '../../shared/trace-id.js';
import { matchRoutePath } from './match-route-path.js';

/**
 * Thin adapter over Node's built-in `node:http`.
 * Replaceable later by an approved third-party HTTP framework adapter
 * that implements the same `HttpServer` port.
 */
export class NodeHttpServer implements HttpServer {
  private readonly routes: HttpRoute[] = [];
  private server: http.Server | undefined;

  constructor(private readonly logger?: Logger) {}

  register(route: HttpRoute): void {
    this.routes.push(route);
  }

  listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        void this.handle(req, res);
      });

      this.server.once('error', reject);
      this.server.listen(port, () => resolve());
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    const host = req.headers.host ?? 'localhost';
    const url = new URL(req.url ?? '/', `http://${host}`);
    const traceId = resolveTraceId(req.headers);
    const accountId = readOptionalHeader(req.headers, 'x-account-id');
    const requestLogger = this.logger?.child({
      trace_id: traceId,
      account_id: accountId,
    });

    const matched = this.routes
      .map((candidate) => {
        if (candidate.method !== method) {
          return null;
        }
        const pathMatch = matchRoutePath(candidate.path, url.pathname);
        if (!pathMatch) {
          return null;
        }
        return { route: candidate, params: pathMatch.params };
      })
      .find((entry) => entry !== null);

    if (!matched) {
      requestLogger?.warn('HTTP not found', { method, path: url.pathname });
      this.write(res, 404, { error: 'Not Found' }, traceId);
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      this.write(res, 400, { error: 'Invalid JSON body' }, traceId);
      return;
    }

    const request: HttpRequest = {
      method,
      url: url.pathname,
      headers: req.headers,
      body,
      params: matched.params,
      accountId,
      clientIp: resolveClientIp(req),
    };

    try {
      const response = await matched.route.handler(request);
      requestLogger?.info('HTTP request completed', {
        method,
        path: url.pathname,
        statusCode: response.statusCode,
      });
      this.write(
        res,
        response.statusCode,
        response.body,
        traceId,
        response.headers,
      );
    } catch (error: unknown) {
      requestLogger?.error('HTTP request failed', {
        method,
        path: url.pathname,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      this.write(res, 500, { error: 'Internal Server Error' }, traceId);
    }
  }

  private write(
    res: http.ServerResponse,
    statusCode: number,
    body: unknown,
    traceId: string,
    headers: Readonly<Record<string, string>> = {
      'content-type': 'application/json; charset=utf-8',
    },
  ): void {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(statusCode, { ...headers, 'x-trace-id': traceId });
    res.end(payload);
  }
}

function readOptionalHeader(
  headers: http.IncomingHttpHeaders,
  name: string,
): string | null {
  const raw = headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  return value.trim();
}

function resolveClientIp(req: http.IncomingMessage): string {
  const forwarded = readOptionalHeader(req.headers, 'x-forwarded-for');
  if (forwarded !== null) {
    const first = forwarded.split(',')[0]?.trim();
    if (first !== undefined && first.length > 0) {
      return first;
    }
  }
  const remote = req.socket.remoteAddress;
  return remote !== undefined && remote.trim() !== '' ? remote : 'unknown';
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'DELETE') {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw === '') {
    return undefined;
  }
  return JSON.parse(raw) as unknown;
}
