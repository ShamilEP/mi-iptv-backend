import type { GetHealthStatus } from '../../../application/health/get-health-status.js';
import type { HttpRoute } from '../../../application/ports/http-server.js';

export function createHealthRoute(getHealthStatus: GetHealthStatus): HttpRoute {
  return {
    method: 'GET',
    path: '/health',
    handler: () => ({
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: getHealthStatus.execute(),
    }),
  };
}
