export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type HttpRequest = {
  readonly method: HttpMethod | string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
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
