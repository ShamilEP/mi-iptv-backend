import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { describe, it } from 'node:test';
import { AssertAccessTokenActive } from '../../src/application/auth/assert-access-token-active.js';
import { AuthenticateRealtimeHandshake } from '../../src/application/realtime/authenticate-realtime-handshake.js';
import { RealtimeConnectionRegistry } from '../../src/application/realtime/realtime-connection-registry.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { loadRealtimeGatewayConfig } from '../../src/config/realtime.js';
import { deviceChannel } from '../../src/domain/realtime/realtime-protocol.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { InMemoryRedisClient } from '../../src/infrastructure/cache/in-memory-redis-client.js';
import { RedisAccessTokenDenyList } from '../../src/infrastructure/cache/redis-access-token-deny-list.js';
import { NodeRs256AccessTokenService } from '../../src/infrastructure/crypto/node-rs256-access-token-service.js';
import { InMemoryDeviceSocketPresence } from '../../src/infrastructure/realtime/in-memory-device-socket-presence.js';
import { InMemoryRealtimeDeviceBus } from '../../src/infrastructure/realtime/in-memory-realtime-device-bus.js';
import { InMemoryRealtimeSessionStore } from '../../src/infrastructure/realtime/in-memory-realtime-session-store.js';
import {
  computeWebSocketAccept,
  encodeWsFrame,
  tryDecodeWsFrame,
  WS_OPCODE_TEXT,
} from '../../src/infrastructure/realtime/node-websocket-frames.js';
import { EnvJwtSigningKeyStore } from '../../src/infrastructure/secrets/env-jwt-signing-key-store.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';
import { NodeRealtimeGateway } from '../../src/presentation/realtime/node-realtime-gateway.js';

async function createStack(maxPerDevice = 2) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const store = new EnvJwtSigningKeyStore({
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    activeKid: 'rt-kid',
  });
  const ttl = loadJwtTokenTtlConfig({});
  const access = new NodeRs256AccessTokenService(store, ttl);
  const denyList = new RedisAccessTokenDenyList(new InMemoryRedisClient());
  const assertActive = new AssertAccessTokenActive(access, denyList);
  const authenticate = new AuthenticateRealtimeHandshake(assertActive);
  const presence = new InMemoryDeviceSocketPresence();
  const bus = new InMemoryRealtimeDeviceBus();
  const sessions = new InMemoryRealtimeSessionStore();
  const gateway = new NodeRealtimeGateway({
    authenticate,
    presence,
    bus,
    sessions,
    config: {
      ...loadRealtimeGatewayConfig({}),
      maxConnectionsPerDevice: maxPerDevice,
      maxConnectionsPerAccount: 20,
    },
  });
  return { access, authenticate, presence, bus, sessions, gateway };
}

class FakeSocket extends EventEmitter {
  readonly chunks: Buffer[] = [];
  destroyed = false;

  write(chunk: string | Buffer): boolean {
    this.chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    return true;
  }

  end(): this {
    this.emit('close');
    return this;
  }

  destroy(): this {
    this.destroyed = true;
    this.emit('close');
    return this;
  }
}

function asDuplex(socket: FakeSocket): Duplex {
  return socket as unknown as Duplex;
}

function buildUpgradeRequest(params: {
  readonly deviceId: string;
  readonly token: string;
  readonly resumeToken?: string;
}): IncomingMessage {
  const search = new URLSearchParams({ deviceId: params.deviceId });
  if (params.resumeToken) {
    search.set('resumeToken', params.resumeToken);
  }
  const req = new EventEmitter() as IncomingMessage;
  req.url = `/realtime?${search.toString()}`;
  req.headers = {
    host: 'localhost',
    authorization: `Bearer ${params.token}`,
    'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
    upgrade: 'websocket',
    connection: 'Upgrade',
  };
  return req;
}

function waitForHello(socket: FakeSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('hello timeout')), 2000);
    const check = () => {
      const joined = Buffer.concat(socket.chunks);
      // Skip HTTP 101 header if present.
      const idx = joined.indexOf('\r\n\r\n');
      const body = idx >= 0 ? joined.subarray(idx + 4) : joined;
      const decoded = tryDecodeWsFrame(body);
      if (decoded === null) {
        return;
      }
      clearTimeout(timer);
      resolve(
        JSON.parse(decoded.frame.payload.toString('utf8')) as Record<
          string,
          unknown
        >,
      );
    };
    socket.on('data', check);
    // Also poll writes from gateway (server pushes via write(), not 'data').
    const interval = setInterval(() => {
      try {
        check();
        clearInterval(interval);
      } catch {
        /* keep waiting until timeout */
      }
    }, 5);
    const originalWrite = socket.write.bind(socket);
    socket.write = (chunk: string | Buffer) => {
      const ok = originalWrite(chunk);
      queueImmediate(check);
      return ok;
    };
  });
}

describe('BE-077 realtime gateway', () => {
  it('registers realtimeHandshake in the route catalog', () => {
    const entry = ROUTE_CATALOG.find(
      (route) => route.method === 'GET' && route.path === '/realtime',
    );
    assert.ok(entry);
    assert.equal(entry.operationId, 'realtimeHandshake');
  });

  it('authenticates JWT and binds deviceId on handshake', async () => {
    const { access, authenticate } = await createStack();
    const deviceId = randomUUID();
    const accountId = randomUUID();
    const issued = access.issue({
      accountId,
      deviceId,
      roles: ['user'],
    });
    const claims = await authenticate.execute({
      accessToken: issued.token,
      deviceId,
    });
    assert.equal(claims.accountId, accountId);
    await assert.rejects(
      () =>
        authenticate.execute({
          accessToken: issued.token,
          deviceId: randomUUID(),
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'REALTIME_DEVICE_MISMATCH',
    );
  });

  it('completes WSS handshake hello, presence, resume, and device-channel fan-out', async () => {
    const api = await createStack();
    const deviceId = randomUUID();
    const accountId = randomUUID();
    const issued = api.access.issue({
      accountId,
      deviceId,
      roles: ['user'],
    });

    const socket = new FakeSocket();
    const helloPromise = waitForHello(socket);
    api.gateway.handleUpgrade(
      buildUpgradeRequest({ deviceId, token: issued.token }),
      asDuplex(socket),
      Buffer.alloc(0),
    );
    const hello = await helloPromise;
    assert.equal(hello.type, 'hello');
    assert.equal(hello.deviceChannel, deviceChannel(deviceId));
    assert.equal(typeof hello.sessionId, 'string');
    assert.equal(typeof hello.resumeToken, 'string');
    assert.match(
      Buffer.concat(socket.chunks).toString('utf8'),
      /101 Switching Protocols/,
    );
    assert.equal(await api.presence.hasOpenSocket(accountId, deviceId), true);

    const fanout: string[] = [];
    const originalWrite = socket.write.bind(socket);
    socket.write = (chunk: string | Buffer) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      const decoded = tryDecodeWsFrame(buf);
      if (decoded !== null) {
        fanout.push(decoded.frame.payload.toString('utf8'));
      }
      return originalWrite(chunk);
    };
    await api.bus.publish(
      deviceId,
      JSON.stringify({
        type: 'event',
        channel: deviceChannel(deviceId),
        payload: { action: 'ping-device' },
      }),
    );
    assert.equal(fanout.length, 1);
    assert.match(fanout[0]!, /ping-device/);

    // Client heartbeat refreshes presence.
    socket.emit(
      'data',
      encodeWsFrame(
        WS_OPCODE_TEXT,
        Buffer.from(JSON.stringify({ type: 'heartbeat' })),
        true,
      ),
    );
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(await api.presence.hasOpenSocket(accountId, deviceId), true);

    // Resume reconnect keeps session id.
    const socket2 = new FakeSocket();
    const hello2Promise = waitForHello(socket2);
    api.gateway.handleUpgrade(
      buildUpgradeRequest({
        deviceId,
        token: issued.token,
        resumeToken: String(hello.resumeToken),
      }),
      asDuplex(socket2),
      Buffer.alloc(0),
    );
    const hello2 = await hello2Promise;
    assert.equal(hello2.sessionId, hello.sessionId);
    socket.destroy();
    socket2.destroy();
  });

  it('rejects excess device connections with 429', async () => {
    const api = await createStack(1);
    const deviceId = randomUUID();
    const accountId = randomUUID();
    const issued = api.access.issue({
      accountId,
      deviceId,
      roles: ['user'],
    });

    const first = new FakeSocket();
    const helloPromise = waitForHello(first);
    api.gateway.handleUpgrade(
      buildUpgradeRequest({ deviceId, token: issued.token }),
      asDuplex(first),
      Buffer.alloc(0),
    );
    await helloPromise;

    const second = new FakeSocket();
    api.gateway.handleUpgrade(
      buildUpgradeRequest({ deviceId, token: issued.token }),
      asDuplex(second),
      Buffer.alloc(0),
    );
    await new Promise((r) => setTimeout(r, 30));
    const body = Buffer.concat(second.chunks).toString('utf8');
    assert.match(body, /429/);
    assert.match(body, /REALTIME_DEVICE_CONNECTION_LIMIT/);
    first.destroy();
    second.destroy();
  });

  it('computes RFC6455 accept keys and tracks registry limits', () => {
    const key = 'dGhlIHNhbXBsZSBub25jZQ==';
    assert.equal(
      computeWebSocketAccept(key),
      createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64'),
    );
    const registry = new RealtimeConnectionRegistry(1, 2);
    registry.register({
      connectionId: 'c1',
      accountId: 'a',
      deviceId: 'd',
      sessionId: 's',
    });
    assert.throws(
      () =>
        registry.register({
          connectionId: 'c2',
          accountId: 'a',
          deviceId: 'd',
          sessionId: 's',
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'REALTIME_DEVICE_CONNECTION_LIMIT',
    );
  });
});
