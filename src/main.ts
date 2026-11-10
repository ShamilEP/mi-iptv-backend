import { GetHealthStatus } from './application/health/get-health-status.js';
import { loadConfig } from './config/env.js';
import { NodeHttpServer } from './presentation/http/node-http-server.js';
import { createHealthRoute } from './presentation/http/routes/health-route.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const getHealthStatus = new GetHealthStatus();
  const httpServer = new NodeHttpServer();

  httpServer.register(createHealthRoute(getHealthStatus));

  await httpServer.listen(config.port);
  console.log(`Mi IPTV backend listening on port ${config.port}`);
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  console.error(message);
  process.exitCode = 1;
});
