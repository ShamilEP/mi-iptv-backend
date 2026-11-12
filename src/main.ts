import { randomBytes } from 'node:crypto';
import { GetHealthStatus } from './application/health/get-health-status.js';
import { CreateSource } from './application/sources/create-source.js';
import { DeleteSource } from './application/sources/delete-source.js';
import { ListSources } from './application/sources/list-sources.js';
import { UpdateSource } from './application/sources/update-source.js';
import { loadConfig, loadInjectedSecrets } from './config/env.js';
import { loadPasswordHashParams } from './config/password-hashing.js';
import { Argon2PasswordHasher } from './infrastructure/crypto/argon2-password-hasher.js';
import {
  Aes256GcmSourceCredentialCipher,
  decodeSourceCredentialsDataKey,
} from './infrastructure/crypto/aes256-gcm-source-credential-cipher.js';
import { JsonConsoleLogger } from './infrastructure/logging/json-console-logger.js';
import { InMemorySourceRepository } from './infrastructure/persistence/in-memory-source-repository.js';
import { EnvSecretStore } from './infrastructure/secrets/env-secret-store.js';
import { StaticCredentialEncryptionKeyCatalog } from './infrastructure/secrets/static-credential-encryption-key-catalog.js';
import { StaticKmsKeyResolver } from './infrastructure/secrets/static-kms-key-resolver.js';
import { NodeHttpServer } from './presentation/http/node-http-server.js';
import { createHealthRoute } from './presentation/http/routes/health-route.js';
import { createSourcesRoutes } from './presentation/http/routes/sources-routes.js';

async function bootstrap(): Promise<void> {
  const logger = new JsonConsoleLogger();
  const kmsKeyResolver = new StaticKmsKeyResolver();
  const secretStore = new EnvSecretStore();
  const credentialKeyCatalog = new StaticCredentialEncryptionKeyCatalog();
  const config = loadConfig(process.env, kmsKeyResolver);
  const passwordHashParams = loadPasswordHashParams(process.env);
  // Wired for auth use cases (BE-020+); plaintext passwords never logged.
  const passwordHasher = new Argon2PasswordHasher(passwordHashParams);
  const credentialKmsKey = credentialKeyCatalog.get(config.appEnv);

  // Secrets from secret manager port (INF-013). Values are never logged.
  const secrets = await loadInjectedSecrets(config.appEnv, secretStore);
  const secretsLoaded = {
    databaseUrl: Boolean(secrets.databaseUrl),
    redisUrl: Boolean(secrets.redisUrl),
    jwtPrivateKey: Boolean(secrets.jwtPrivateKey),
    jwtPublicKey: Boolean(secrets.jwtPublicKey),
    sourceCredentialsDataKey: Boolean(secrets.sourceCredentialsDataKey),
  };

  // BE-042/BE-040: envelope cipher. Process-local DEK if unset (in-memory store only).
  const sourceCredentialCipher = new Aes256GcmSourceCredentialCipher(
    secrets.sourceCredentialsDataKey
      ? decodeSourceCredentialsDataKey(secrets.sourceCredentialsDataKey)
      : randomBytes(32),
    credentialKmsKey.keyId,
  );

  const sourceRepository = new InMemorySourceRepository();
  const listSources = new ListSources(sourceRepository);
  const createSource = new CreateSource(
    sourceRepository,
    sourceCredentialCipher,
  );
  const updateSource = new UpdateSource(
    sourceRepository,
    sourceCredentialCipher,
  );
  const deleteSource = new DeleteSource(sourceRepository);

  const getHealthStatus = new GetHealthStatus();
  const httpServer = new NodeHttpServer(logger);

  httpServer.register(createHealthRoute(getHealthStatus));
  for (const route of createSourcesRoutes({
    listSources,
    createSource,
    updateSource,
    deleteSource,
  })) {
    httpServer.register(route);
  }

  await httpServer.listen(config.port);
  logger.info('Mi IPTV backend listening', {
    trace_id: null,
    account_id: null,
    port: config.port,
    appEnv: config.appEnv,
    logLevel: config.logLevel,
    kmsKeyId: config.kmsKeyId,
    sourceCredentialsKmsKeyId: credentialKmsKey.keyId,
    sourceCredentialsKeyRotationDays: credentialKmsKey.rotationIntervalDays,
    passwordHashAlgorithm: passwordHashParams.algorithm,
    passwordHashMemoryKiB: passwordHashParams.memoryKiB,
    passwordHashTimeCost: passwordHashParams.timeCost,
    passwordHashParallelism: passwordHashParams.parallelism,
    passwordHasherReady: Boolean(passwordHasher),
    sourceCredentialCipherReady: true,
    sourceCredentialsDataKeyInjected: secretsLoaded.sourceCredentialsDataKey,
    sourceRegistryPersistence: 'in-memory',
    sourceCredentialsAutomaticCmkRotation:
      credentialKmsKey.automaticCmkRotation,
    secretsLoaded,
  });
}

bootstrap().catch((error: unknown) => {
  const logger = new JsonConsoleLogger();
  logger.error('Startup failed', {
    trace_id: null,
    account_id: null,
    errorMessage:
      error instanceof Error ? error.message : 'Unknown startup error',
  });
  process.exitCode = 1;
});
