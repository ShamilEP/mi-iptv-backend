import { GetHealthStatus } from './application/health/get-health-status.js';
import { FetchSourceUrlSafely } from './application/sources/fetch-source-url-safely.js';
import { ValidateSourceUrl } from './application/sources/validate-source-url.js';
import { loadConfig, loadInjectedSecrets } from './config/env.js';
import { loadPasswordHashParams } from './config/password-hashing.js';
import { loadSourceHttpGuardConfig } from './config/source-http-guard.js';
import { Argon2PasswordHasher } from './infrastructure/crypto/argon2-password-hasher.js';
import {
  Aes256GcmSourceCredentialCipher,
  decodeSourceCredentialsDataKey,
} from './infrastructure/crypto/aes256-gcm-source-credential-cipher.js';
import { NodeSourceHttpClient } from './infrastructure/http/node-source-http-client.js';
import { JsonConsoleLogger } from './infrastructure/logging/json-console-logger.js';
import { NodeDnsResolver } from './infrastructure/net/node-dns-resolver.js';
import { EnvSecretStore } from './infrastructure/secrets/env-secret-store.js';
import { StaticCredentialEncryptionKeyCatalog } from './infrastructure/secrets/static-credential-encryption-key-catalog.js';
import { StaticKmsKeyResolver } from './infrastructure/secrets/static-kms-key-resolver.js';
import { NodeHttpServer } from './presentation/http/node-http-server.js';
import { createHealthRoute } from './presentation/http/routes/health-route.js';

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

  // BE-042: envelope cipher when DEK is injected (KMS-managed via Secrets Manager).
  const sourceCredentialCipher = secrets.sourceCredentialsDataKey
    ? new Aes256GcmSourceCredentialCipher(
        decodeSourceCredentialsDataKey(secrets.sourceCredentialsDataKey),
        credentialKmsKey.keyId,
      )
    : null;

  // BE-041: SSRF-safe source URL validation / fetch (wired for sources ingest).
  const sourceHttpGuard = loadSourceHttpGuardConfig(process.env);
  const validateSourceUrl = new ValidateSourceUrl(new NodeDnsResolver());
  const fetchSourceUrlSafely = new FetchSourceUrlSafely(
    validateSourceUrl,
    new NodeSourceHttpClient(),
    sourceHttpGuard,
  );

  const getHealthStatus = new GetHealthStatus();
  const httpServer = new NodeHttpServer(logger);

  httpServer.register(createHealthRoute(getHealthStatus));

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
    sourceCredentialCipherReady: sourceCredentialCipher !== null,
    sourceCredentialsAutomaticCmkRotation:
      credentialKmsKey.automaticCmkRotation,
    sourceHttpMaxRedirects: sourceHttpGuard.maxRedirects,
    sourceHttpMaxResponseBytes: sourceHttpGuard.maxResponseBytes,
    sourceHttpTimeoutMs: sourceHttpGuard.timeoutMs,
    sourceUrlGuardReady: Boolean(fetchSourceUrlSafely),
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
