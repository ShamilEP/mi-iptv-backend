import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { describe, it } from 'node:test';
import { AssertAccessTokenActive } from '../../src/application/auth/assert-access-token-active.js';
import { DeviceHeartbeat } from '../../src/application/devices/device-heartbeat.js';
import { RegisterDevice } from '../../src/application/devices/register-device.js';
import { SendToTv } from '../../src/application/devices/send-to-tv.js';
import { UnlinkDevice } from '../../src/application/devices/unlink-device.js';
import { CreateProfile } from '../../src/application/profiles/create-profile.js';
import { GetProfile } from '../../src/application/profiles/get-profile.js';
import { requireOwnedProfile } from '../../src/application/profiles/require-owned-profile.js';
import { AuthenticateRealtimeHandshake } from '../../src/application/realtime/authenticate-realtime-handshake.js';
import { FanOutDeviceCommand } from '../../src/application/realtime/fan-out-device-command.js';
import { CreateSource } from '../../src/application/sources/create-source.js';
import { DeleteSource } from '../../src/application/sources/delete-source.js';
import { UpdateSource } from '../../src/application/sources/update-source.js';
import { ListFavorites } from '../../src/application/sync/list-favorites.js';
import { SetFavorite } from '../../src/application/sync/set-favorite.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { loadRealtimeGatewayConfig } from '../../src/config/realtime.js';
import { deviceChannel } from '../../src/domain/realtime/realtime-protocol.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { InMemoryRedisClient } from '../../src/infrastructure/cache/in-memory-redis-client.js';
import { RedisAccessTokenDenyList } from '../../src/infrastructure/cache/redis-access-token-deny-list.js';
import { Aes256GcmSourceCredentialCipher } from '../../src/infrastructure/crypto/aes256-gcm-source-credential-cipher.js';
import { NodeRs256AccessTokenService } from '../../src/infrastructure/crypto/node-rs256-access-token-service.js';
import { InMemoryDeviceCommandRepository } from '../../src/infrastructure/persistence/in-memory-device-command-repository.js';
import { InMemoryDeviceRepository } from '../../src/infrastructure/persistence/in-memory-device-repository.js';
import { InMemoryFavoriteSyncRepository } from '../../src/infrastructure/persistence/in-memory-favorite-sync-repository.js';
import { InMemoryProfileRepository } from '../../src/infrastructure/persistence/in-memory-profile-repository.js';
import { InMemorySourceRepository } from '../../src/infrastructure/persistence/in-memory-source-repository.js';
import { InMemoryPushNotifier } from '../../src/infrastructure/push/in-memory-push-notifier.js';
import { InMemoryDeviceSocketPresence } from '../../src/infrastructure/realtime/in-memory-device-socket-presence.js';
import { InMemoryRealtimeDeviceBus } from '../../src/infrastructure/realtime/in-memory-realtime-device-bus.js';
import { InMemoryRealtimeSessionStore } from '../../src/infrastructure/realtime/in-memory-realtime-session-store.js';
import {
  encodeWsFrame,
  tryDecodeWsFrame,
  WS_OPCODE_TEXT,
} from '../../src/infrastructure/realtime/node-websocket-frames.js';
import { RedisRealtimeDeviceBus } from '../../src/infrastructure/realtime/redis-realtime-device-bus.js';
import { EnvJwtSigningKeyStore } from '../../src/infrastructure/secrets/env-jwt-signing-key-store.js';
import { NodeRealtimeGateway } from '../../src/presentation/realtime/node-realtime-gateway.js';

const reviewPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/security/015-idor-bola-authorization-review.md',
);

const accountA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const accountB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const dek = Buffer.alloc(32, 7);

describe('SEC-015 IDOR / BOLA authorization', () => {
  it('documents DoD checklist completion in the review', () => {
    const doc = readFileSync(reviewPath, 'utf8');
    assert.match(doc, /SEC-015/);
    assert.match(doc, /IDOR \/ BOLA/);
    assert.match(
      doc,
      /- \[x\] Every implemented endpoint scoped by account/,
    );
    assert.match(
      doc,
      /- \[x\] Send-to-TV and realtime remote delivery constrained/,
    );
    assert.match(doc, /- \[x\] Automated negative tests/);
    assert.match(doc, /tenant_isolation/);
    assert.match(doc, /requireOwnedProfile/);
  });

  it('rejects cross-account profile access (BOLA on path id)', async () => {
    const profiles = new InMemoryProfileRepository();
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const access = new NodeRs256AccessTokenService(
      new EnvJwtSigningKeyStore({
        privateKeyPem: privateKey,
        publicKeyPem: publicKey,
        activeKid: 'sec015',
      }),
      loadJwtTokenTtlConfig({}),
    );
    const create = new CreateProfile(access, profiles);
    const get = new GetProfile(access, profiles);

    const tokenA = access.issue({
      accountId: accountA,
      deviceId: randomUUID(),
      roles: ['user'],
    }).token;
    const tokenB = access.issue({
      accountId: accountB,
      deviceId: randomUUID(),
      roles: ['user'],
    }).token;

    const profileB = await create.execute({
      accessToken: tokenB,
      name: 'Victim',
    });

    await assert.rejects(
      () => requireOwnedProfile(profiles, accountA, profileB.id),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'PROFILE_NOT_FOUND',
    );
    await assert.rejects(
      () =>
        get.execute({
          accessToken: tokenA,
          profileId: profileB.id,
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'PROFILE_NOT_FOUND',
    );
  });

  it('rejects cross-account source mutation', async () => {
    const repo = new InMemorySourceRepository();
    const cipher = new Aes256GcmSourceCredentialCipher(dek, 'test-dek');
    const create = new CreateSource(repo, cipher);
    const update = new UpdateSource(repo, cipher);
    const del = new DeleteSource(repo);

    const victimSource = await create.execute({
      accountId: accountB,
      kind: 'm3u',
      name: 'Victim M3U',
      uriRef: 'https://example.com/b.m3u',
    });

    await assert.rejects(
      () =>
        update.execute({
          accountId: accountA,
          sourceId: victimSource.id,
          name: 'Hijacked',
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'SOURCE_NOT_FOUND',
    );
    await assert.rejects(
      () => del.execute(accountA, victimSource.id),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'SOURCE_NOT_FOUND',
    );
  });

  it('rejects cross-account device unlink/heartbeat and send-to-TV', async () => {
    const devices = new InMemoryDeviceRepository();
    const presence = new InMemoryDeviceSocketPresence();
    const register = new RegisterDevice(devices, presence);
    const unlink = new UnlinkDevice(devices);
    const heartbeat = new DeviceHeartbeat(devices, presence);
    const commands = new InMemoryDeviceCommandRepository();
    const fanOut = new FanOutDeviceCommand(
      new RedisRealtimeDeviceBus(new InMemoryRedisClient()),
    );
    const sendToTv = new SendToTv(
      devices,
      commands,
      presence,
      fanOut,
      new InMemoryPushNotifier(),
    );

    const attackerCompanion = await register.execute({
      accountId: accountA,
      deviceType: 'companion',
      platform: 'android',
    });
    const victimTv = await register.execute({
      accountId: accountB,
      deviceType: 'tv',
      platform: 'android_tv',
      pushToken: 'victim-token',
    });

    await assert.rejects(
      () => unlink.execute(accountA, victimTv.id),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'DEVICE_NOT_FOUND',
    );
    await assert.rejects(
      () =>
        heartbeat.execute({
          accountId: accountA,
          deviceId: victimTv.id,
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'DEVICE_NOT_FOUND',
    );
    await assert.rejects(
      () =>
        sendToTv.execute({
          accountId: accountA,
          authenticatedDeviceId: attackerCompanion.id,
          senderDeviceId: attackerCompanion.id,
          targetDeviceId: victimTv.id,
          contentId: 'stolen',
          sourceId: randomUUID(),
          action: 'play',
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'DEVICE_NOT_FOUND',
    );
  });

  it('rejects sync writes against another account profile id', async () => {
    const profiles = new InMemoryProfileRepository();
    const favorites = new InMemoryFavoriteSyncRepository();
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const access = new NodeRs256AccessTokenService(
      new EnvJwtSigningKeyStore({
        privateKeyPem: privateKey,
        publicKeyPem: publicKey,
        activeKid: 'sec015-sync',
      }),
      loadJwtTokenTtlConfig({}),
    );
    const tokenB = access.issue({
      accountId: accountB,
      deviceId: randomUUID(),
      roles: ['user'],
    }).token;
    const profileB = await new CreateProfile(access, profiles).execute({
      accessToken: tokenB,
      name: 'B',
    });

    const list = new ListFavorites(favorites, profiles);
    const set = new SetFavorite(favorites, profiles);

    await assert.rejects(
      () => list.execute(accountA, profileB.id),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'PROFILE_NOT_FOUND',
    );
    await assert.rejects(
      () =>
        set.execute({
          accountId: accountA,
          profileId: profileB.id,
          deviceId: randomUUID(),
          clientEventId: randomUUID(),
          itemId: 'item-1',
          type: 'channel',
          action: 'add',
          syncVersion: 0,
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'PROFILE_NOT_FOUND',
    );
  });

  it('ignores WSS event publishes aimed at another device channel', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const store = new EnvJwtSigningKeyStore({
      privateKeyPem: privateKey,
      publicKeyPem: publicKey,
      activeKid: 'rt-sec015',
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
    const bus = new InMemoryRealtimeDeviceBus();
    const gateway = new NodeRealtimeGateway({
      authenticate,
      presence: new InMemoryDeviceSocketPresence(),
      bus,
      sessions: new InMemoryRealtimeSessionStore(),
      config: loadRealtimeGatewayConfig({}),
    });

    const attackerDevice = randomUUID();
    const victimDevice = randomUUID();
    const token = access.issue({
      accountId: accountA,
      deviceId: attackerDevice,
      roles: ['user'],
    }).token;

    let victimFanout = '';
    await bus.subscribe(victimDevice, (message) => {
      victimFanout = message;
    });

    const socket = new FakeSocket();
    const req = upgradeRequest(attackerDevice, token);
    gateway.handleUpgrade(req, socket as unknown as Duplex, Buffer.alloc(0));
    await waitForChunks(socket);
    assert.equal(parseHello(socket.chunks).type, 'hello');

    const evil = JSON.stringify({
      type: 'event',
      channel: deviceChannel(victimDevice),
      payload: { action: 'play', contentId: 'evil' },
    });
    socket.emit('data', encodeWsFrame(WS_OPCODE_TEXT, Buffer.from(evil)));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(victimFanout, '');

    let ownFanout = '';
    await bus.subscribe(attackerDevice, (message) => {
      ownFanout = message;
    });
    const own = JSON.stringify({
      type: 'event',
      channel: deviceChannel(attackerDevice),
      payload: { ok: true },
    });
    socket.emit('data', encodeWsFrame(WS_OPCODE_TEXT, Buffer.from(own)));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.match(ownFanout, /"ok":true/);
  });
});

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

function upgradeRequest(deviceId: string, token: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.url = `/realtime?${new URLSearchParams({ deviceId }).toString()}`;
  req.headers = {
    host: 'localhost',
    authorization: `Bearer ${token}`,
    'sec-websocket-key': createHash('sha1')
      .update(`sec015-${deviceId}`)
      .digest('base64'),
  };
  return req;
}

function parseHello(chunks: Buffer[]): Record<string, unknown> {
  const joined = Buffer.concat(chunks);
  const idx = joined.indexOf('\r\n\r\n');
  assert.ok(idx >= 0);
  const decoded = tryDecodeWsFrame(joined.subarray(idx + 4));
  assert.ok(decoded);
  return JSON.parse(decoded.frame.payload.toString('utf8')) as Record<
    string,
    unknown
  >;
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
