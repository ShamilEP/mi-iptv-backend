import type { IngestQoeEvents } from '../../../application/diagnostics/ingest-qoe-events.js';
import type { HttpRoute } from '../../../application/ports/http-server.js';
import { handleIngestQoeEvents } from './diagnostics-qoe-route.js';

export function createDiagnosticsRoutes(deps: {
  readonly ingestQoeEvents: IngestQoeEvents;
}): readonly HttpRoute[] {
  return [
    {
      method: 'POST',
      path: '/api/v1/diagnostics/qoe',
      handler: (request) =>
        handleIngestQoeEvents(request, deps.ingestQoeEvents),
    },
  ];
}
