import type { HttpMethod } from '../../application/ports/http-server.js';

/**
 * Presentation routes that must stay aligned with `openapi/openapi.json`.
 * When adding an HTTP route, update this catalog and the OpenAPI document together.
 */
export type RouteCatalogEntry = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly operationId: string;
};

export const ROUTE_CATALOG: readonly RouteCatalogEntry[] = [
  {
    method: 'GET',
    path: '/health',
    operationId: 'getHealth',
  },
] as const;
