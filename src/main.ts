import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { IssueAuthTokenPair } from './application/auth/issue-auth-token-pair.js';
import { LoginAccount } from './application/auth/login-account.js';
import { RefreshAuthSession } from './application/auth/refresh-auth-session.js';
import { FetchXtreamCatalog } from './application/catalog/fetch-xtream-catalog.js';
import { ParseM3uPlaylist } from './application/catalog/parse-m3u-playlist.js';
import { DeviceHeartbeat } from './application/devices/device-heartbeat.js';
import { ListDevices } from './application/devices/list-devices.js';
import { RegisterDevice } from './application/devices/register-device.js';
import { UnlinkDevice } from './application/devices/unlink-device.js';
import { GetHealthStatus } from './application/health/get-health-status.js';
import type { JwtSigningKeyStore } from './application/ports/jwt-signing-key-store.js';
import { CreateSource } from './application/sources/create-source.js';
import { DeleteSource } from './application/sources/delete-source.js';
import { FetchSourceUrlSafely } from './application/sources/fetch-source-url-safely.js';
import { ListSources } from './application/sources/list-sources.js';
import { TestSource } from './application/sources/test-source.js';
import { UpdateSource } from './application/sources/update-source.js';
import { ValidateSourceUrl } from './application/sources/validate-source-url.js';
import { ListFavorites } from './application/sync/list-favorites.js';
import { SetFavorite } from './application/sync/set-favorite.js';
import { UpsertPlaybackState } from './application/sync/upsert-playback-state.js';
import { loadConfig, loadInjectedSecrets } from './config/env.js';
import { loadJwtTokenTtlConfig } from './config/jwt-tokens.js';
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
import { NodeRs256AccessTokenService } from './infrastructure/crypto/node-rs256-access-token-service.js';
import { OpaqueRefreshTokenService } from './infrastructure/crypto/opaque-refresh-token-service.js';
import { NodeSourceHttpClient } from './infrastructure/http/node-source-http-client.js';
import { JsonConsoleLogger } from './infrastructure/logging/json-console-logger.js';
import { NodeDnsResolver } from './infrastructure/net/node-dns-resolver.js';
import { InMemoryAccountRepository } from './infrastructure/persistence/in-memory-account-repository.js';
import { InMemoryDeviceRepository } from './infrastructure/persistence/in-memory-device-repository.js';
import { InMemoryFavoriteSyncRepository } from './infrastructure/persistence/in-memory-favorite-sync-repository.js';
import { InMemoryPlaybackSyncRepository } from './infrastructure/persistence/in-memory-playback-sync-repository.js';
import { InMemoryRefreshTokenRepository } from './infrastructure/persistence/in-memory-refresh-token-repository.js';
import { InMemorySourceRepository } from './infrastructure/persistence/in-memory-source-repository.js';
import { EnvJwtSigningKeyStore } from './infrastructure/secrets/env-jwt-signing-key-store.js';
import { EnvSecretStore } from './infrastructure/secrets/env-secret-store.js';
import { StaticCredentialEncryptionKeyCatalog } from './infrastructure/secrets/static-credential-encryption-key-catalog.js';
import { StaticKmsKeyResolver } from './infrastructure/secrets/static-kms-key-resolver.js';
import { NodeHttpServer } from './presentation/http/node-http-server.js';
import { createAuthRoutes } from './presentation/http/routes/auth-routes.js';
import { createDevicesRoutes } from './presentation/http/routes/devices-routes.js';
import { createHealthRoute } from './presentation/http/routes/health-route.js';
import { createSourcesRoutes } from './presentation/http/routes/sources-routes.js';
import { createSyncRoutes } from './presentation/http/routes/sync-routes.js';

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
  const jwtTtl = loadJwtTokenTtlConfig(process.env);

  // Secrets from secret manager port (INF-013). Values are never logged.
  const secrets = await loadInjectedSecrets(config.appEnv, secretStore);
  const secretsLoaded = {
    databaseUrl: Boolean(secrets.databaseUrl),
    redisUrl: Boolean(secrets.redisUrl),
    jwtPrivateKey: Boolean(secrets.jwtPrivateKey),
    jwtPublicKey: Boolean(secrets.jwtPublicKey),
    sourceCredentialsDataKey: Boolean(secrets.sourceCredentialsDataKey),
  };

  // BE-023: RS256 access JWT + opaque device-bound refresh (ADR-004).
  const jwtSigningKeys = resolveJwtSigningKeyStore(
    config.appEnv,
    secrets.jwtPrivateKey,
    secrets.jwtPublicKey,
    process.env,
  );
  const accessTokenService = new NodeRs256AccessTokenService(
    jwtSigningKeys,
    jwtTtl,
  );
  const refreshTokenService = new OpaqueRefreshTokenService(jwtTtl);
  const issueAuthTokenPair = new IssueAuthTokenPair(
    accessTokenService,
    refreshTokenService,
  );

  // BE-022: email/password login with device-bound session (in-memory until Postgres adapters).
  const accountRepository = new InMemoryAccountRepository();
  const refreshTokenRepository = new InMemoryRefreshTokenRepository();
  const loginAccount = new LoginAccount(
    accountRepository,
    passwordHasher,
    issueAuthTokenPair,
    refreshTokenRepository,
  );
  const refreshAuthSession = new RefreshAuthSession(
    accountRepository,
    refreshTokenService,
    refreshTokenRepository,
    issueAuthTokenPair,
  );

  // BE-042/SEC-030: AES-256-GCM with KMS-managed DEK. Fail closed outside dev.
  const sourceCredentialCipher = new Aes256GcmSourceCredentialCipher(
    resolveSourceCredentialsDataKey(
      config.appEnv,
      secrets.sourceCredentialsDataKey,
    ),
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

  // BE-075: device registration / list / unlink / heartbeat.
  const deviceRepository = new InMemoryDeviceRepository();
  const listDevices = new ListDevices(deviceRepository);
  const registerDevice = new RegisterDevice(deviceRepository);
  const unlinkDevice = new UnlinkDevice(deviceRepository);
  const deviceHeartbeat = new DeviceHeartbeat(deviceRepository);

  // BE-061/BE-063: sync writes (domain rules from BE-060; in-memory until Postgres).
  const playbackSyncRepository = new InMemoryPlaybackSyncRepository();
  const upsertPlaybackState = new UpsertPlaybackState(playbackSyncRepository);
  const favoriteSyncRepository = new InMemoryFavoriteSyncRepository();
  const listFavorites = new ListFavorites(favoriteSyncRepository);
  const setFavorite = new SetFavorite(favoriteSyncRepository);

  const getHealthStatus = new GetHealthStatus();
  const httpServer = new NodeHttpServer(logger);

  httpServer.register(createHealthRoute(getHealthStatus));
  for (const route of createAuthRoutes({ loginAccount, refreshAuthSession })) {
    httpServer.register(route);
  }
  for (const route of createSourcesRoutes({
    listSources,
    createSource,
    updateSource,
    deleteSource,
    testSource,
  })) {
    httpServer.register(route);
  }
  for (const route of createDevicesRoutes({
    listDevices,
    registerDevice,
    unlinkDevice,
    deviceHeartbeat,
  })) {
    httpServer.register(route);
  }
  for (const route of createSyncRoutes({
    upsertPlaybackState,
    listFavorites,
    setFavorite,
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
    jwtAccessTtlSeconds: jwtTtl.accessTokenTtlSeconds,
    jwtRefreshTtlSeconds: jwtTtl.refreshTokenTtlSeconds,
    jwtIssuer: jwtTtl.issuer,
    jwtActiveKid: jwtSigningKeys.getActiveSigningKey().kid,
    jwtSigningReady: Boolean(issueAuthTokenPair),
    authLoginReady: Boolean(loginAccount),
    authRefreshReady: Boolean(refreshAuthSession),
    accountPersistence: 'in-memory',
    refreshTokenPersistence: 'in-memory',
    sourceCredentialCipherReady: true,
    sourceCredentialsDataKeyInjected: secretsLoaded.sourceCredentialsDataKey,
    sourceRegistryPersistence: 'in-memory',
    deviceRegistryPersistence: 'in-memory',
    playbackSyncPersistence: 'in-memory',
    playbackSyncReady: Boolean(upsertPlaybackState),
    favoriteSyncPersistence: 'in-memory',
    favoriteSyncReady: Boolean(setFavorite),
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

function resolveSourceCredentialsDataKey(
  appEnv: string,
  injected: string | undefined,
): Uint8Array {
  if (injected !== undefined && injected.trim() !== '') {
    return decodeSourceCredentialsDataKey(injected);
  }
  if (appEnv === 'dev') {
    // Sprint 0 local/in-memory only — never for qa/prod.
    return randomBytes(32);
  }
  throw new Error(
    'SOURCE_CREDENTIALS_DATA_KEY is required outside APP_ENV=dev (SEC-030)',
  );
}

function resolveJwtSigningKeyStore(
  appEnv: string,
  privateKeyPem: string | undefined,
  publicKeyPem: string | undefined,
  env: NodeJS.ProcessEnv,
): JwtSigningKeyStore {
  const activeKid = env['JWT_KEY_ID']?.trim();
  if (
    privateKeyPem !== undefined &&
    privateKeyPem.trim() !== '' &&
    publicKeyPem !== undefined &&
    publicKeyPem.trim() !== '' &&
    activeKid !== undefined &&
    activeKid.length > 0
  ) {
    return new EnvJwtSigningKeyStore({
      privateKeyPem,
      publicKeyPem,
      activeKid,
      previousPublicKeysJson: env['JWT_PREVIOUS_PUBLIC_KEYS'],
    });
  }
  if (appEnv === 'dev') {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return new EnvJwtSigningKeyStore({
      privateKeyPem: privateKey,
      publicKeyPem: publicKey,
      activeKid: activeKid !== undefined && activeKid.length > 0 ? activeKid : 'dev-ephemeral',
    });
  }
  throw new Error(
    'JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, and JWT_KEY_ID are required outside APP_ENV=dev (BE-023)',
  );
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
