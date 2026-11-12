import { randomBytes } from 'node:crypto';
import { FetchXtreamCatalog } from './application/catalog/fetch-xtream-catalog.js';
import { ParseM3uPlaylist } from './application/catalog/parse-m3u-playlist.js';
import { GetHealthStatus } from './application/health/get-health-status.js';
import { CreateSource } from './application/sources/create-source.js';
import { DeleteSource } from './application/sources/delete-source.js';
import { FetchSourceUrlSafely } from './application/sources/fetch-source-url-safely.js';
import { ListSources } from './application/sources/list-sources.js';
import { TestSource } from './application/sources/test-source.js';
import { UpdateSource } from './application/sources/update-source.js';
import { ValidateSourceUrl } from './application/sources/validate-source-url.js';
import { loadConfig, loadInjectedSecrets } from './config/env.js';
import { loadM3uParserLimits } from './config/m3u-parser.js';
import { loadPasswordHashParams } from './config/password-hashing.js';
import { loadSourceHttpGuardConfig } from './config/source-http-guard.js';
import { HttpXtreamCodesClient } from './infrastructure/catalog/http-xtream-codes-client.js';
import { IsolatedM3uPlaylistParser } from './infrastructure/catalog/isolated-m3u-playlist-parser.js';
import { Argon2PasswordHasher } from './infrastructure/crypto/argon2-password-hasher.js';
import {
  Aes256GcmSourceCredentialCipher,
  decodeSourceCredentialsDataKey,
} from './infrastructure/crypto/aes256-gcm-source-credential-cipher.js';
import { NodeSourceHttpClient } from './infrastructure/http/node-source-http-client.js';
import { JsonConsoleLogger } from './infrastructure/logging/json-console-logger.js';
import { NodeDnsResolver } from './infrastructure/net/node-dns-resolver.js';
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

  // BE-041: SSRF-safe source URL validation / fetch (wired for sources ingest).
  const sourceHttpGuard = loadSourceHttpGuardConfig(process.env);
  const validateSourceUrl = new ValidateSourceUrl(new NodeDnsResolver());
  const fetchSourceUrlSafely = new FetchSourceUrlSafely(
    validateSourceUrl,
    new NodeSourceHttpClient(),
    sourceHttpGuard,
  );

  // BE-044: isolated streaming M3U parser (ingest / source test).
  const m3uParserLimits = loadM3uParserLimits(process.env);
  const parseM3uPlaylist = new ParseM3uPlaylist(
    new IsolatedM3uPlaylistParser(m3uParserLimits),
    m3uParserLimits,
  );

  // BE-045: Xtream Codes player_api adapter (SSRF-safe fetch).
  const xtreamClient = new HttpXtreamCodesClient(fetchSourceUrlSafely);
  const fetchXtreamCatalog = new FetchXtreamCatalog(xtreamClient);

  // BE-043: source connectivity test with classified reasons.
  const testSource = new TestSource(
    sourceRepository,
    sourceCredentialCipher,
    fetchSourceUrlSafely,
    parseM3uPlaylist,
    xtreamClient,
    sourceHttpGuard.timeoutMs,
  );

  const getHealthStatus = new GetHealthStatus();
  const httpServer = new NodeHttpServer(logger);

  httpServer.register(createHealthRoute(getHealthStatus));
  for (const route of createSourcesRoutes({
    listSources,
    createSource,
    updateSource,
    deleteSource,
    testSource,
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
    sourceHttpMaxRedirects: sourceHttpGuard.maxRedirects,
    sourceHttpMaxResponseBytes: sourceHttpGuard.maxResponseBytes,
    sourceHttpTimeoutMs: sourceHttpGuard.timeoutMs,
    sourceUrlGuardReady: Boolean(fetchSourceUrlSafely),
    m3uParserMaxBytes: m3uParserLimits.maxBytes,
    m3uParserMaxEntries: m3uParserLimits.maxEntries,
    m3uParserTimeoutMs: m3uParserLimits.timeoutMs,
    m3uParserReady: Boolean(parseM3uPlaylist),
    xtreamAdapterReady: Boolean(fetchXtreamCatalog),
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
