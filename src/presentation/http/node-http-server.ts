import http from 'node:http';
import { URL } from 'node:url';
import type {
  HttpRequest,
  HttpRoute,
  HttpServer,
} from '../../application/ports/http-server.js';
import type { Logger } from '../../application/ports/logger.js';
import { buildErrorEnvelope } from '../../domain/api/error-envelope.js';
import { resolveTraceId } from '../../shared/trace-id.js';
import type { ApiGateway } from './gateway/api-gateway.js';
import { matchRoutePath } from './match-route-path.js';

/**
 * Thin adapter over Node's built-in `node:http`.
 * Replaceable later by an approved third-party HTTP framework adapter
 * that implements the same `HttpServer` port.
 *
 * When an `ApiGateway` is provided (BE-006), runs validation / JWT /
 * rate-limit hooks before the matched route handler.
 */
export class NodeHttpServer implements HttpServer {
  private readonly routes: HttpRoute[] = [];
  private server: http.Server | undefined;

  constructor(
    private readonly logger?: Logger,
    private readonly gateway?: ApiGateway,
  ) {}

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
    let requestLogger = this.logger?.child({
      trace_id: traceId,
      account_id: null,
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
      this.write(
        res,
        404,
        buildErrorEnvelope({
          error: 'Not Found',
          code: 'NOT_FOUND',
          traceId,
        }),
        traceId,
      );
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(
        req,
        this.gateway?.maxJsonBodyBytes ?? Number.POSITIVE_INFINITY,
      );
    } catch (error: unknown) {
      if (error instanceof BodyTooLargeError) {
        this.write(
          res,
          413,
          buildErrorEnvelope({
            error: 'Request body too large',
            code: 'REQUEST_BODY_TOO_LARGE',
            traceId,
            details: { maxBytes: error.maxBytes },
          }),
          traceId,
        );
        return;
      }
      this.write(
        res,
        400,
        buildErrorEnvelope({
          error: 'Invalid JSON body',
          code: 'REQUEST_BODY_INVALID',
          traceId,
        }),
        traceId,
      );
      return;
    }

    let request: HttpRequest = {
      method,
      url: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: req.headers,
      body,
      params: matched.params,
      accountId: null,
      auth: null,
      clientIp: resolveClientIp(req),
    };

    if (this.gateway !== undefined) {
      const gatewayResult = await this.gateway.beforeHandler(
        request,
        matched.route,
        traceId,
      );
      if ('statusCode' in gatewayResult) {
        requestLogger?.info('HTTP gateway rejected request', {
          method,
          path: url.pathname,
          statusCode: gatewayResult.statusCode,
        });
        this.write(
          res,
          gatewayResult.statusCode,
          gatewayResult.body,
          traceId,
          gatewayResult.headers,
        );
        return;
      }
      request = gatewayResult.request;
      if (request.accountId) {
        requestLogger = this.logger?.child({
          trace_id: traceId,
          account_id: request.accountId,
        });
      }
    }

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
      this.write(
        res,
        500,
        buildErrorEnvelope({
          error: 'Internal Server Error',
          code: 'INTERNAL',
          traceId,
        }),
        traceId,
      );
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

class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super('Request body too large');
    this.name = 'BodyTooLargeError';
  }
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

async function readJsonBody(
  req: http.IncomingMessage,
  maxBytes: number,
): Promise<unknown> {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'DELETE') {
    return undefined;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (Number.isFinite(maxBytes) && total > maxBytes) {
      req.destroy();
      throw new BodyTooLargeError(maxBytes);
    }
    chunks.push(buf);
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
