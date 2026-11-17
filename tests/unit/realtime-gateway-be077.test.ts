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
  const access = new NodeRs256AccessTokenService(
    store,
    loadJwtTokenTtlConfig({}),
  );
  const authenticate = new AuthenticateRealtimeHandshake(
    new AssertAccessTokenActive(
      access,
      new RedisAccessTokenDenyList(new InMemoryRedisClient()),
    ),
  );
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

function parseHelloFromChunks(chunks: Buffer[]): Record<string, unknown> {
  const joined = Buffer.concat(chunks);
  const idx = joined.indexOf('\r\n\r\n');
  assert.ok(idx >= 0, 'expected HTTP 101 header');
  const decoded = tryDecodeWsFrame(joined.subarray(idx + 4));
  assert.ok(decoded, 'expected websocket hello frame');
  return JSON.parse(decoded.frame.payload.toString('utf8')) as Record<
    string,
    unknown
  >;
}

function upgradeRequest(
  deviceId: string,
  token: string,
  resumeToken?: string,
): IncomingMessage {
  const search = new URLSearchParams({ deviceId });
  if (resumeToken) {
    search.set('resumeToken', resumeToken);
  }
  const req = new EventEmitter() as IncomingMessage;
  req.url = `/realtime?${search.toString()}`;
  req.headers = {
    host: 'localhost',
    authorization: `Bearer ${token}`,
    'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
  };
  return req;
}

async function waitForChunks(socket: FakeSocket): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (socket.chunks.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('gateway wrote no response chunks');
}

describe('BE-077 realtime gateway', () => {
  it('registers realtimeHandshake in the route catalog', () => {
    const entry = ROUTE_CATALOG.find(
      (route) => route.method === 'GET' && route.path === '/realtime',
    );
    assert.ok(entry);
    assert.equal(entry.operationId, 'realtimeHandshake');
  });

  it('authenticates JWT and binds deviceId', async () => {
    const { access, authenticate } = await createStack();
    const deviceId = randomUUID();
    const issued = access.issue({
      accountId: randomUUID(),
      deviceId,
      roles: ['user'],
    });
    const claims = await authenticate.execute({
      accessToken: issued.token,
      deviceId,
    });
    assert.equal(claims.deviceId, deviceId);
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

  it('handshakes hello, presence, resume, heartbeat, and device fan-out', async () => {
    const api = await createStack();
    const deviceId = randomUUID();
    const accountId = randomUUID();
    const issued = api.access.issue({
      accountId,
      deviceId,
      roles: ['user'],
    });

    const socket = new FakeSocket();
    api.gateway.handleUpgrade(
      upgradeRequest(deviceId, issued.token),
      socket as unknown as Duplex,
      Buffer.alloc(0),
    );
    await waitForChunks(socket);

    const hello = parseHelloFromChunks(socket.chunks);
    assert.equal(hello.type, 'hello');
    assert.equal(hello.deviceChannel, deviceChannel(deviceId));
    assert.equal(await api.presence.hasOpenSocket(accountId, deviceId), true);

    let fanout = '';
    const prevWrite = socket.write.bind(socket);
    socket.write = (chunk: string | Buffer) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      const decoded = tryDecodeWsFrame(buf);
      if (decoded) {
        fanout = decoded.frame.payload.toString('utf8');
      }
      return prevWrite(chunk);
    };
    await api.bus.publish(
      deviceId,
      JSON.stringify({
        type: 'event',
        channel: deviceChannel(deviceId),
        payload: { action: 'ping-device' },
      }),
    );
    assert.match(fanout, /ping-device/);

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

    const socket2 = new FakeSocket();
    api.gateway.handleUpgrade(
      upgradeRequest(deviceId, issued.token, String(hello.resumeToken)),
      socket2 as unknown as Duplex,
      Buffer.alloc(0),
    );
    await waitForChunks(socket2);
    const hello2 = parseHelloFromChunks(socket2.chunks);
    assert.equal(hello2.sessionId, hello.sessionId);

    socket.destroy();
    socket2.destroy();
  });

  it('rejects excess device connections with 429', async () => {
    const api = await createStack(1);
    const deviceId = randomUUID();
    const issued = api.access.issue({
      accountId: randomUUID(),
      deviceId,
      roles: ['user'],
    });

    const first = new FakeSocket();
    api.gateway.handleUpgrade(
      upgradeRequest(deviceId, issued.token),
      first as unknown as Duplex,
      Buffer.alloc(0),
    );
    await waitForChunks(first);
    parseHelloFromChunks(first.chunks);

    const second = new FakeSocket();
    api.gateway.handleUpgrade(
      upgradeRequest(deviceId, issued.token),
      second as unknown as Duplex,
      Buffer.alloc(0),
    );
    await waitForChunks(second);
    const body = Buffer.concat(second.chunks).toString('utf8');
    assert.match(body, /429/);
    assert.match(body, /REALTIME_DEVICE_CONNECTION_LIMIT/);
    first.destroy();
    second.destroy();
  });

  it('supports RFC6455 framing helpers and connection registry limits', () => {
    const key = 'dGhlIHNhbXBsZSBub25jZQ==';
    assert.equal(
      computeWebSocketAccept(key),
      createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64'),
    );
    const frame = encodeWsFrame(WS_OPCODE_TEXT, Buffer.from('{"type":"ping"}'));
    const decoded = tryDecodeWsFrame(frame);
    assert.ok(decoded);
    assert.equal(decoded.frame.payload.toString('utf8'), '{"type":"ping"}');

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
