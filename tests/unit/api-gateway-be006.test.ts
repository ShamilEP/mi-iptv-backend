import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import http from 'node:http';
import { describe, it } from 'node:test';
import { AssertAccessTokenActive } from '../../src/application/auth/assert-access-token-active.js';
import { ApiRateLimitGuard } from '../../src/application/gateway/api-rate-limit-guard.js';
import { GetHealthStatus } from '../../src/application/health/get-health-status.js';
import {
  DEFAULT_API_RATE_LIMIT_MAX_REQUESTS,
  loadApiGatewayConfig,
} from '../../src/config/api-gateway.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { API_V1_PREFIX } from '../../src/domain/api/api-versioning.js';
import { InMemoryRedisClient } from '../../src/infrastructure/cache/in-memory-redis-client.js';
import { RedisAccessTokenDenyList } from '../../src/infrastructure/cache/redis-access-token-deny-list.js';
import { NodeRs256AccessTokenService } from '../../src/infrastructure/crypto/node-rs256-access-token-service.js';
import { EnvJwtSigningKeyStore } from '../../src/infrastructure/secrets/env-jwt-signing-key-store.js';
import {
  createApiGateway,
  resolveRouteAuth,
} from '../../src/presentation/http/gateway/api-gateway.js';
import { NodeHttpServer } from '../../src/presentation/http/node-http-server.js';
import { createHealthRoute } from '../../src/presentation/http/routes/health-route.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';

async function createGatewayStack(rateLimitMax = 100) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const store = new EnvJwtSigningKeyStore({
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    activeKid: 'be006-kid',
  });
  const ttl = loadJwtTokenTtlConfig({});
  const access = new NodeRs256AccessTokenService(store, ttl);
  const redis = new InMemoryRedisClient();
  const denyList = new RedisAccessTokenDenyList(redis);
  const assertActive = new AssertAccessTokenActive(access, denyList);
  const rateLimit = new ApiRateLimitGuard(redis, rateLimitMax, 20, 60);
  const gateway = createApiGateway({
    assertAccessTokenActive: assertActive,
    apiRateLimitGuard: rateLimit,
    maxJsonBodyBytes: 1024,
  });
  return { access, denyList, gateway, redis };
}

async function listenOnPort(
  gateway: ReturnType<typeof createApiGateway>,
  register: (server: NodeHttpServer) => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
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
  register(server);
  await server.listen(port);
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => server.close(),
  };
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

describe('BE-006 API Gateway / BFF skeleton', () => {
  it('exposes load-balancer health under GET /health without JWT', async () => {
    const { gateway } = await createGatewayStack();
    const health = createHealthRoute(new GetHealthStatus());
    assert.equal(health.auth, 'public');
    assert.equal(resolveRouteAuth(health), 'public');

    const catalog = ROUTE_CATALOG.find(
      (route) => route.method === 'GET' && route.path === '/health',
    );
    assert.ok(catalog);

    const { baseUrl, close } = await listenOnPort(gateway, (server) => {
      server.register(health);
    });
    try {
      const res = await httpJson(`${baseUrl}/health`);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { status: 'ok' });
      assert.ok(res.headers['x-trace-id']);
    } finally {
      await close();
    }
  });

  it('keeps business routes under /api/v1 and requires JWT by default', async () => {
    assert.ok(API_V1_PREFIX.startsWith('/api/'));
    const { gateway, access } = await createGatewayStack();
    const { baseUrl, close } = await listenOnPort(gateway, (server) => {
      server.register({
        method: 'GET',
        path: `${API_V1_PREFIX}/sources`,
        handler: (request) => ({
          statusCode: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: { accountId: request.accountId },
        }),
      });
    });
    try {
      const denied = await httpJson(`${baseUrl}${API_V1_PREFIX}/sources`);
      assert.equal(denied.status, 401);
      assert.equal(
        (denied.body as { code: string }).code,
        'AUTH_ACCESS_INVALID',
      );

      const issued = access.issue({
        accountId: randomUUID(),
        deviceId: randomUUID(),
        roles: ['user'],
      });
      const ok = await httpJson(`${baseUrl}${API_V1_PREFIX}/sources`, {
        headers: { authorization: `Bearer ${issued.token}` },
      });
      assert.equal(ok.status, 200);
      assert.deepEqual(ok.body, { accountId: issued.claims.accountId });
    } finally {
      await close();
    }
  });

  it('rejects non-JSON Content-Type when a body is present (validation hook)', async () => {
    const { gateway, access } = await createGatewayStack();
    const issued = access.issue({
      accountId: randomUUID(),
      deviceId: randomUUID(),
      roles: ['user'],
    });
    const { baseUrl, close } = await listenOnPort(gateway, (server) => {
      server.register({
        method: 'POST',
        path: `${API_V1_PREFIX}/echo`,
        handler: () => ({
          statusCode: 200,
          body: { ok: true },
        }),
      });
    });
    try {
      const res = await fetch(`${baseUrl}${API_V1_PREFIX}/echo`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${issued.token}`,
          'content-type': 'text/plain',
        },
        body: '{"x":1}',
      });
      assert.equal(res.status, 415);
      const body = (await res.json()) as { code: string };
      assert.equal(body.code, 'REQUEST_CONTENT_TYPE_INVALID');
    } finally {
      await close();
    }
  });

  it('enforces the global rate-limit hook (100 rpm default config)', async () => {
    const config = loadApiGatewayConfig({});
    assert.equal(
      config.rateLimitMaxRequests,
      DEFAULT_API_RATE_LIMIT_MAX_REQUESTS,
    );

    const { gateway, access } = await createGatewayStack(2);
    const issued = access.issue({
      accountId: randomUUID(),
      deviceId: randomUUID(),
      roles: ['user'],
    });
    const { baseUrl, close } = await listenOnPort(gateway, (server) => {
      server.register({
        method: 'GET',
        path: `${API_V1_PREFIX}/ping`,
        handler: () => ({ statusCode: 200, body: { ok: true } }),
      });
    });
    try {
      const headers = { authorization: `Bearer ${issued.token}` };
      assert.equal(
        (await httpJson(`${baseUrl}${API_V1_PREFIX}/ping`, { headers })).status,
        200,
      );
      assert.equal(
        (await httpJson(`${baseUrl}${API_V1_PREFIX}/ping`, { headers })).status,
        200,
      );
      const limited = await httpJson(`${baseUrl}${API_V1_PREFIX}/ping`, {
        headers,
      });
      assert.equal(limited.status, 429);
      assert.equal((limited.body as { code: string }).code, 'API_RATE_LIMITED');
      assert.ok(limited.headers['retry-after']);
    } finally {
      await close();
    }
  });

  it('rejects revoked access tokens via JWT middleware deny-list', async () => {
    const { gateway, access, denyList } = await createGatewayStack();
    const issued = access.issue({
      accountId: randomUUID(),
      deviceId: randomUUID(),
      roles: ['user'],
    });
    await denyList.revokeJti(issued.claims.jti, 60);

    const { baseUrl, close } = await listenOnPort(gateway, (server) => {
      server.register({
        method: 'GET',
        path: `${API_V1_PREFIX}/secure`,
        handler: () => ({ statusCode: 200, body: { ok: true } }),
      });
    });
    try {
      const res = await httpJson(`${baseUrl}${API_V1_PREFIX}/secure`, {
        headers: { authorization: `Bearer ${issued.token}` },
      });
      assert.equal(res.status, 401);
      assert.equal((res.body as { code: string }).code, 'AUTH_ACCESS_REVOKED');
    } finally {
      await close();
    }
  });
});
