import { GetHealthStatus } from './application/health/get-health-status.js';
import { loadConfig, loadInjectedSecrets } from './config/env.js';
import { EnvSecretStore } from './infrastructure/secrets/env-secret-store.js';
import { StaticKmsKeyResolver } from './infrastructure/secrets/static-kms-key-resolver.js';
import { NodeHttpServer } from './presentation/http/node-http-server.js';
import { createHealthRoute } from './presentation/http/routes/health-route.js';

async function bootstrap(): Promise<void> {
  const kmsKeyResolver = new StaticKmsKeyResolver();
  const secretStore = new EnvSecretStore();
  const config = loadConfig(process.env, kmsKeyResolver);

  // Resolve secrets via port (env-injected mock). Values are not logged.
  await loadInjectedSecrets(config.appEnv, secretStore);

  const getHealthStatus = new GetHealthStatus();
  const httpServer = new NodeHttpServer();

  httpServer.register(createHealthRoute(getHealthStatus));

  await httpServer.listen(config.port);
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Mi IPTV backend listening',
      port: config.port,
      appEnv: config.appEnv,
      kmsKeyId: config.kmsKeyId,
    }),
  );
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  console.error(message);
  process.exitCode = 1;
});
