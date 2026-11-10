import http from 'node:http';
import { URL } from 'node:url';
import type {
  HttpRequest,
  HttpRoute,
  HttpServer,
} from '../../application/ports/http-server.js';

/**
 * Thin adapter over Node's built-in `node:http`.
 * Replaceable later by an approved third-party HTTP framework adapter
 * that implements the same `HttpServer` port.
 */
export class NodeHttpServer implements HttpServer {
  private readonly routes: HttpRoute[] = [];
  private server: http.Server | undefined;

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
    const route = this.routes.find(
      (candidate) =>
        candidate.method === method && candidate.path === url.pathname,
    );

    if (!route) {
      this.write(res, 404, { error: 'Not Found' });
      return;
    }

    const request: HttpRequest = {
      method,
      url: url.pathname,
      headers: req.headers,
    };

    try {
      const response = await route.handler(request);
      this.write(res, response.statusCode, response.body, response.headers);
    } catch {
      this.write(res, 500, { error: 'Internal Server Error' });
    }
  }

  private write(
    res: http.ServerResponse,
    statusCode: number,
    body: unknown,
    headers: Readonly<Record<string, string>> = {
      'content-type': 'application/json; charset=utf-8',
    },
  ): void {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(statusCode, headers);
    res.end(payload);
  }
}
