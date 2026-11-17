import assert from 'node:assert/strict';
import {
  createSign,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { AssertAccessTokenActive } from '../../src/application/auth/assert-access-token-active.js';
import { IssueAuthTokenPair } from '../../src/application/auth/issue-auth-token-pair.js';
import {
  LOGIN_BRUTE_FORCE_MAX_FAILURES,
  LoginBruteForceGuard,
} from '../../src/application/auth/login-brute-force-guard.js';
import { LoginAccount } from '../../src/application/auth/login-account.js';
import { LogoutAccount } from '../../src/application/auth/logout-account.js';
import { RefreshAuthSession } from '../../src/application/auth/refresh-auth-session.js';
import { RegisterAbuseGuard } from '../../src/application/auth/register-abuse-guard.js';
import { RegisterAccount } from '../../src/application/auth/register-account.js';
import { ApiRateLimitGuard } from '../../src/application/gateway/api-rate-limit-guard.js';
import { CreateDefaultProfile } from '../../src/application/profiles/create-default-profile.js';
import { CreateSource } from '../../src/application/sources/create-source.js';
import { DeleteSource } from '../../src/application/sources/delete-source.js';
import { ListSources } from '../../src/application/sources/list-sources.js';
import { UpdateSource } from '../../src/application/sources/update-source.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { loadPasswordHashParams } from '../../src/config/password-hashing.js';
import { API_V1_PREFIX } from '../../src/domain/api/api-versioning.js';
import { REQUIRED_ACCESS_TOKEN_ALG } from '../../src/domain/auth/access-token-rules.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { InMemoryRedisClient } from '../../src/infrastructure/cache/in-memory-redis-client.js';
import { RedisAccessTokenDenyList } from '../../src/infrastructure/cache/redis-access-token-deny-list.js';
import { Aes256GcmSourceCredentialCipher } from '../../src/infrastructure/crypto/aes256-gcm-source-credential-cipher.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/crypto/argon2-password-hasher.js';
import { NodeRs256AccessTokenService } from '../../src/infrastructure/crypto/node-rs256-access-token-service.js';
import { OpaqueRefreshTokenService } from '../../src/infrastructure/crypto/opaque-refresh-token-service.js';
import { InMemoryAccountRepository } from '../../src/infrastructure/persistence/in-memory-account-repository.js';
import { InMemoryAccountSyncClock } from '../../src/infrastructure/persistence/in-memory-account-sync-clock.js';
import { InMemoryProfileRepository } from '../../src/infrastructure/persistence/in-memory-profile-repository.js';
import { InMemoryRefreshTokenRepository } from '../../src/infrastructure/persistence/in-memory-refresh-token-repository.js';
import { InMemorySourceRepository } from '../../src/infrastructure/persistence/in-memory-source-repository.js';
import { EnvJwtSigningKeyStore } from '../../src/infrastructure/secrets/env-jwt-signing-key-store.js';
import { createApiGateway } from '../../src/presentation/http/gateway/api-gateway.js';
import { NodeHttpServer } from '../../src/presentation/http/node-http-server.js';
import { createAuthRoutes } from '../../src/presentation/http/routes/auth-routes.js';
import { createSourcesRoutes } from '../../src/presentation/http/routes/sources-routes.js';
import { createAllowingValidateSourceUrl } from '../helpers/source-use-cases.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const testHashParams = loadPasswordHashParams({
  PASSWORD_ARGON2_MEMORY_KIB: '19456',
  PASSWORD_ARGON2_TIME_COST: '2',
  PASSWORD_ARGON2_PARALLELISM: '1',
});

const SENSITIVE_BODY_KEYS = new Set([
  'password',
  'passwordHash',
  'passwd',
  'privateKey',
  'sourcePassword',
  'sourceCredentials',
]);

type JsonBody = Record<string, unknown>;

type Harness = {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
  readonly access: NodeRs256AccessTokenService;
  readonly privateKeyPem: string;
  readonly ttl: ReturnType<typeof loadJwtTokenTtlConfig>;
  readonly refreshTokens: InMemoryRefreshTokenRepository;
  readonly refreshService: OpaqueRefreshTokenService;
};

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function assertNoSensitiveLeak(body: unknown, attemptedPassword?: string): void {
  const serialized = JSON.stringify(body);
  assert.ok(serialized !== undefined);
  if (attemptedPassword !== undefined && attemptedPassword.length > 0) {
    assert.equal(serialized.includes(attemptedPassword), false);
  }
  if (body === null || typeof body !== 'object') {
    return;
  }
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    for (const [key, nested] of Object.entries(value as JsonBody)) {
      if (SENSITIVE_BODY_KEYS.has(key)) {
        assert.equal(
          nested,
          null,
          `sensitive field ${key} must be null or absent`,
        );
      }
      walk(nested);
    }
  };
  walk(body);
}

function signExpiredAccessToken(input: {
  readonly privateKeyPem: string;
  readonly kid: string;
  readonly issuer: string;
  readonly audience: string;
  readonly accountId: string;
  readonly deviceId: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: REQUIRED_ACCESS_TOKEN_ALG,
    typ: 'JWT',
    kid: input.kid,
  };
  const payload = {
    iss: input.issuer,
    aud: input.audience,
    sub: input.accountId,
    accountId: input.accountId,
    deviceId: input.deviceId,
    roles: ['user'],
    jti: randomUUID(),
    iat: now - 7200,
    exp: now - 60,
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${base64Url(signer.sign(input.privateKeyPem))}`;
}

function base64UrlJson(value: unknown): string {
  return base64Url(Buffer.from(JSON.stringify(value), 'utf8'));
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function httpJson(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<{ status: number; body: unknown; headers: http.IncomingHttpHeaders }> {
  const requestInit: RequestInit = {
    method: init.method ?? 'GET',
  };
  if (init.headers !== undefined) {
    requestInit.headers = init.headers;
  }
  if (init.body !== undefined) {
    requestInit.body = JSON.stringify(init.body);
  }
  const response = await fetch(url, requestInit);
  const text = await response.text();
  let body: unknown = undefined;
  if (text.trim() !== '') {
    body = JSON.parse(text) as unknown;
  }
  const headers: http.IncomingHttpHeaders = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { status: response.status, body, headers };
}

async function createHarness(): Promise<Harness> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const store = new EnvJwtSigningKeyStore({
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    activeKid: 'sec051-kid',
  });
  const ttl = loadJwtTokenTtlConfig({});
  const access = new NodeRs256AccessTokenService(store, ttl);
  const refreshService = new OpaqueRefreshTokenService(ttl);
  const hasher = new Argon2PasswordHasher(testHashParams);
  const accounts = new InMemoryAccountRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const profiles = new InMemoryProfileRepository();
  const redis = new InMemoryRedisClient();
  const issuePair = new IssueAuthTokenPair(access, refreshService);
  const login = new LoginAccount(
    accounts,
    hasher,
    issuePair,
    refreshTokens,
    new LoginBruteForceGuard(redis),
  );
  const register = new RegisterAccount(
    accounts,
    hasher,
    issuePair,
    refreshTokens,
    new CreateDefaultProfile(profiles),
    new RegisterAbuseGuard(redis),
  );
  const refreshSession = new RefreshAuthSession(
    accounts,
    refreshService,
    refreshTokens,
    issuePair,
  );
  const denyList = new RedisAccessTokenDenyList(redis);
  const logout = new LogoutAccount(
    access,
    denyList,
    refreshTokens,
    ttl.accessTokenTtlSeconds,
  );
  const assertActive = new AssertAccessTokenActive(access, denyList);
  const gateway = createApiGateway({
    assertAccessTokenActive: assertActive,
    apiRateLimitGuard: new ApiRateLimitGuard(redis, 1000, 200, 60),
    maxJsonBodyBytes: 64 * 1024,
  });

  const sourceRepo = new InMemorySourceRepository();
  const cipher = new Aes256GcmSourceCredentialCipher(
    randomBytes(32),
    'arn:aws:kms:us-east-1:000000000001:key/mock-sec051',
  );
  const clock = new InMemoryAccountSyncClock();
  const validateSourceUrl = createAllowingValidateSourceUrl();
  const createSource = new CreateSource(
    sourceRepo,
    cipher,
    clock,
    validateSourceUrl,
  );
  const listSources = new ListSources(sourceRepo);
  const updateSource = new UpdateSource(
    sourceRepo,
    cipher,
    clock,
    validateSourceUrl,
  );
  const deleteSource = new DeleteSource(sourceRepo, clock);

  const raw = http.createServer();
  await new Promise<void>((resolve, reject) => {
    raw.once('error', reject);
    raw.listen(0, '127.0.0.1', () => resolve());
  });
  const address = raw.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    raw.close((error) => (error ? reject(error) : resolve()));
  });

  const server = new NodeHttpServer(undefined, gateway);
  for (const route of createAuthRoutes({
    registerAccount: register,
    loginAccount: login,
    refreshAuthSession: refreshSession,
    logoutAccount: logout,
  })) {
    server.register(route);
  }
  for (const route of createSourcesRoutes({
    listSources,
    createSource,
    updateSource,
    deleteSource,
    testSource: {
      execute: async () => {
        throw new DomainError('unused', 'SOURCE_TEST_UNUSED');
      },
    } as never,
  })) {
    server.register(route);
  }
  await server.listen(port);

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => server.close(),
    access,
    privateKeyPem: privateKey,
    ttl,
    refreshTokens,
    refreshService,
  };
}

describe('SEC-051 pre-launch /auth security (SRS §22)', () => {
  it('documents brute force, token expiry, data exposure, DAST, and mobile SA', () => {
    const review = read('docs/security/051-pre-launch-security-testing.md');
    const mobile = read('docs/security/051-mobile-static-analysis-checklist.md');
    assert.match(review, /brute force/i);
    assert.match(review, /token expiry/i);
    assert.match(review, /data exposure/i);
    assert.match(review, /Authenticated DAST/i);
    assert.match(review, /Mobile static analysis/i);
    assert.match(mobile, /EncryptedSharedPreferences|Keystore/i);
    assert.match(mobile, /Logcat/i);
    assert.match(mobile, /MobSF/i);
  });

  it('locks login after brute-force ceiling without echoing the password', async () => {
    const harness = await createHarness();
    try {
      const email = `brute-${randomUUID()}@example.com`;
      const password = 'Correct-password!1';
      const deviceId = randomUUID();
      const register = await httpJson(`${harness.baseUrl}${API_V1_PREFIX}/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { email, password, deviceId },
      });
      assert.equal(register.status, 201);

      const wrongPassword = 'Wrong-password!9';
      for (let i = 0; i < LOGIN_BRUTE_FORCE_MAX_FAILURES; i += 1) {
        const failed = await httpJson(
          `${harness.baseUrl}${API_V1_PREFIX}/auth/login`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: { email, password: wrongPassword, deviceId },
          },
        );
        assert.equal(failed.status, 401);
        assert.equal((failed.body as JsonBody).code, 'AUTH_INVALID');
        assertNoSensitiveLeak(failed.body, wrongPassword);
      }

      const locked = await httpJson(
        `${harness.baseUrl}${API_V1_PREFIX}/auth/login`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: { email, password: wrongPassword, deviceId },
        },
      );
      assert.equal(locked.status, 429);
      assert.equal((locked.body as JsonBody).code, 'AUTH_RATE_LIMITED');
      assert.ok(locked.headers['retry-after']);
      assertNoSensitiveLeak(locked.body, wrongPassword);
    } finally {
      await harness.close();
    }
  });

  it('rejects expired access JWT on protected routes without leaking secrets', async () => {
    const harness = await createHarness();
    try {
      const accountId = randomUUID();
      const deviceId = randomUUID();
      const expired = signExpiredAccessToken({
        privateKeyPem: harness.privateKeyPem,
        kid: 'sec051-kid',
        issuer: harness.ttl.issuer,
        audience: harness.ttl.audience,
        accountId,
        deviceId,
      });
      assert.throws(() => harness.access.verify(expired));

      const denied = await httpJson(`${harness.baseUrl}${API_V1_PREFIX}/sources`, {
        headers: { authorization: `Bearer ${expired}` },
      });
      assert.equal(denied.status, 401);
      assert.equal((denied.body as JsonBody).code, 'AUTH_ACCESS_INVALID');
      assertNoSensitiveLeak(denied.body);
      assert.equal(
        JSON.stringify(denied.body).includes(harness.privateKeyPem),
        false,
      );
    } finally {
      await harness.close();
    }
  });

  it('rejects expired refresh tokens over HTTP', async () => {
    const harness = await createHarness();
    try {
      const email = `exp-${randomUUID()}@example.com`;
      const password = 'Correct-password!1';
      const deviceId = randomUUID();
      const registered = await httpJson(
        `${harness.baseUrl}${API_V1_PREFIX}/auth/register`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: { email, password, deviceId },
        },
      );
      assert.equal(registered.status, 201);
      const accountId = (registered.body as JsonBody).accountId as string;

      const issued = harness.refreshService.issue({ accountId, deviceId });
      await harness.refreshTokens.insert({
        id: randomUUID(),
        accountId,
        deviceId,
        familyId: issued.familyId,
        tokenHash: issued.tokenHash,
        issuedAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 60_000),
        usedAt: null,
        replacedBy: null,
        revokedAt: null,
        revokedReason: null,
      });

      const refreshed = await httpJson(
        `${harness.baseUrl}${API_V1_PREFIX}/auth/refresh`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: { refreshToken: issued.token },
        },
      );
      assert.equal(refreshed.status, 401);
      assert.equal((refreshed.body as JsonBody).code, 'AUTH_REFRESH_EXPIRED');
      assertNoSensitiveLeak(refreshed.body, issued.token);
    } finally {
      await harness.close();
    }
  });
});

describe('SEC-051 authenticated DAST', () => {
  it('scans auth + sources with a live token for exposure and authz failures', async () => {
    const harness = await createHarness();
    try {
      const email = `dast-${randomUUID()}@example.com`;
      const password = 'Dast-password!1';
      const deviceId = randomUUID();
      const registered = await httpJson(
        `${harness.baseUrl}${API_V1_PREFIX}/auth/register`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: { email, password, deviceId },
        },
      );
      assert.equal(registered.status, 201);
      const accessToken = (registered.body as JsonBody).accessToken as string;
      assert.ok(accessToken);

      const unauth = await httpJson(`${harness.baseUrl}${API_V1_PREFIX}/sources`);
      assert.equal(unauth.status, 401);
      assertNoSensitiveLeak(unauth.body);

      const authHeaders = {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      };

      const listed = await httpJson(`${harness.baseUrl}${API_V1_PREFIX}/sources`, {
        headers: authHeaders,
      });
      assert.equal(listed.status, 200);
      assertNoSensitiveLeak(listed.body);

      const secretPassword = 'xtream-secret-pass!';
      const created = await httpJson(
        `${harness.baseUrl}${API_V1_PREFIX}/sources`,
        {
          method: 'POST',
          headers: authHeaders,
          body: {
            kind: 'xtream',
            name: 'DAST Xtream',
            uriRef: 'https://example.invalid:8080',
            credentials: { username: 'xtream-user', password: secretPassword },
          },
        },
      );
      assert.equal(created.status, 201);
      assert.equal((created.body as JsonBody).password, null);
      assert.equal((created.body as JsonBody).username, null);
      assert.equal((created.body as JsonBody).token, null);
      assert.equal((created.body as JsonBody).credentialsConfigured, true);
      assertNoSensitiveLeak(created.body, secretPassword);

      const listedAgain = await httpJson(
        `${harness.baseUrl}${API_V1_PREFIX}/sources`,
        { headers: authHeaders },
      );
      assert.equal(listedAgain.status, 200);
      assertNoSensitiveLeak(listedAgain.body, secretPassword);

      const expired = signExpiredAccessToken({
        privateKeyPem: harness.privateKeyPem,
        kid: 'sec051-kid',
        issuer: harness.ttl.issuer,
        audience: harness.ttl.audience,
        accountId: (registered.body as JsonBody).accountId as string,
        deviceId,
      });
      const expiredProbe = await httpJson(
        `${harness.baseUrl}${API_V1_PREFIX}/sources`,
        { headers: { authorization: `Bearer ${expired}` } },
      );
      assert.equal(expiredProbe.status, 401);
      assertNoSensitiveLeak(expiredProbe.body);
    } finally {
      await harness.close();
    }
  });
});

describe('SEC-051 mobile static analysis handoff', () => {
  it('ships checklist and conditional CI workflow', () => {
    const workflow = read('.github/workflows/mobile-static-analysis.yml');
    assert.match(workflow, /Android Lint|dart analyze|Flutter/i);
    assert.match(workflow, /apps\/android-tv/);
    assert.match(
      read('docs/security/051-mobile-static-analysis-checklist.md'),
      /MobSF/,
    );
  });
});
