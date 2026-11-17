import type { AccessTokenClaims } from '../../domain/auth/access-token-claims.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Gateway auth mode (BE-006). Default for `/api/v1` routes is `required`. */
export type HttpRouteAuth = 'public' | 'required';

export type HttpRequest = {
  readonly method: HttpMethod | string;
  /** Pathname only (no query string). */
  readonly url: string;
  /** Parsed query string key/values (BE-062 sync state, pagination). */
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  /** Parsed JSON body for POST/PATCH/PUT when Content-Type is JSON. */
  readonly body?: unknown;
  /** Path template params, e.g. `{ id: "..." }` for `/api/v1/sources/{id}`. */
  readonly params?: Readonly<Record<string, string>>;
  /**
   * Account scope from verified JWT (gateway) or test harness.
   * Do not trust client-supplied `x-account-id` alone in production.
   */
  readonly accountId?: string | null;
  /** Verified access JWT claims when gateway JWT middleware ran. */
  readonly auth?: AccessTokenClaims | null;
  /** Client IP for rate limits (BE-028 / BE-006); from socket or X-Forwarded-For. */
  readonly clientIp?: string | null;
};

export type HttpResponse = {
  readonly statusCode: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
};

export type HttpRouteHandler = (
  request: HttpRequest,
) => Promise<HttpResponse> | HttpResponse;

export type HttpRoute = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly handler: HttpRouteHandler;
  /** When omitted: `/health` and `/realtime` are public; all other routes require JWT. */
  readonly auth?: HttpRouteAuth;
};

/** Optional HTTP upgrade hook (BE-077 WSS `/realtime`). */
export type HttpUpgradeHandler = (
  // Keep transport types opaque in the port — Node adapter supplies IncomingMessage/Duplex.
  request: unknown,
  socket: unknown,
  head: unknown,
) => void;

export interface HttpServer {
  register(route: HttpRoute): void;
  listen(port: number): Promise<void>;
  close(): Promise<void>;
  /** Register a single upgrade handler (e.g. authenticated WebSocket). */
  setUpgradeHandler?(handler: HttpUpgradeHandler): void;
}
