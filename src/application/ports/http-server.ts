export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type HttpRequest = {
  readonly method: HttpMethod | string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  /** Parsed JSON body for POST/PATCH/PUT when Content-Type is JSON. */
  readonly body?: unknown;
  /** Path template params, e.g. `{ id: "..." }` for `/api/v1/sources/{id}`. */
  readonly params?: Readonly<Record<string, string>>;
  /** Sprint 0 account scope from `x-account-id` until JWT auth (BE-023). */
  readonly accountId?: string | null;
  /** Client IP for rate limits (BE-028); from socket or X-Forwarded-For. */
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
};

export interface HttpServer {
  register(route: HttpRoute): void;
  listen(port: number): Promise<void>;
  close(): Promise<void>;
}
