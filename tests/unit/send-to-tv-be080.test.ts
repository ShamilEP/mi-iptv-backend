import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { FlushPendingDeviceCommands } from '../../src/application/devices/flush-pending-device-commands.js';
import { RegisterDevice } from '../../src/application/devices/register-device.js';
import { SendToTv } from '../../src/application/devices/send-to-tv.js';
import { FanOutDeviceCommand } from '../../src/application/realtime/fan-out-device-command.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { InMemoryRedisClient } from '../../src/infrastructure/cache/in-memory-redis-client.js';
import { InMemoryDeviceCommandRepository } from '../../src/infrastructure/persistence/in-memory-device-command-repository.js';
import { InMemoryDeviceRepository } from '../../src/infrastructure/persistence/in-memory-device-repository.js';
import { InMemoryPushNotifier } from '../../src/infrastructure/push/in-memory-push-notifier.js';
import { InMemoryDeviceSocketPresence } from '../../src/infrastructure/realtime/in-memory-device-socket-presence.js';
import { RedisRealtimeDeviceBus } from '../../src/infrastructure/realtime/redis-realtime-device-bus.js';
import { MVP_V1_OPERATIONS } from '../../openapi/mvp-v1-inventory.js';
import { createDevicesRoutes } from '../../src/presentation/http/routes/devices-routes.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';

const accountId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const sourceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

async function buildStack() {
  const devices = new InMemoryDeviceRepository();
  const commands = new InMemoryDeviceCommandRepository();
  const presence = new InMemoryDeviceSocketPresence();
  const redis = new InMemoryRedisClient();
  const bus = new RedisRealtimeDeviceBus(redis);
  const fanOut = new FanOutDeviceCommand(bus);
  const push = new InMemoryPushNotifier();
  const register = new RegisterDevice(devices, presence);
  const sendToTv = new SendToTv(devices, commands, presence, fanOut, push);
  const flush = new FlushPendingDeviceCommands(commands, fanOut);

  const companion = await register.execute({
    accountId,
    deviceType: 'companion',
    platform: 'android',
    name: 'Phone',
  });
  const tv = await register.execute({
    accountId,
    deviceType: 'tv',
    platform: 'android_tv',
    name: 'Living Room',
    pushToken: 'fcm-tv-token',
  });
  const otherTv = await register.execute({
    accountId,
    deviceType: 'tv',
    platform: 'android_tv',
    name: 'Bedroom',
  });

  return {
    devices,
    commands,
    presence,
    bus,
    fanOut,
    push,
    sendToTv,
    flush,
    companion,
    tv,
    otherTv,
  };
}

describe('BE-080 send-to-tv', () => {
  it('registers sendToTv in catalog and inventory', () => {
    assert.ok(
      ROUTE_CATALOG.some(
        (route) =>
          route.operationId === 'sendToTv' &&
          route.path === '/api/v1/devices/{id}/send-to-tv',
      ),
    );
    const inventory = MVP_V1_OPERATIONS.find(
      (route) => route.operationId === 'sendToTv',
    );
    assert.equal(inventory?.implemented, true);
  });

  it('delivers play when the target TV socket is online', async () => {
    const api = await buildStack();
    await api.presence.markConnected(accountId, api.tv.id, 'node-a');

    let delivered = '';
    await api.bus.subscribe(api.tv.id, (message) => {
      delivered = message;
    });

    const result = await api.sendToTv.execute({
      accountId,
      authenticatedDeviceId: api.companion.id,
      senderDeviceId: api.companion.id,
      targetDeviceId: api.tv.id,
      contentId: 'live:espn',
      sourceId,
      action: 'play',
    });

    assert.equal(result.status, 'delivered');
    assert.match(result.expiresAt, /Z$/);
    assert.match(delivered, /"type":"send_to_tv"/);
    assert.match(delivered, /"contentId":"live:espn"/);
    assert.match(delivered, /"sourceId":/);
    assert.equal(api.push.sent.length, 0);
  });

  it('queues when offline, wakes via push, and flushes on reconnect', async () => {
    const api = await buildStack();

    const queued = await api.sendToTv.execute({
      accountId,
      authenticatedDeviceId: api.companion.id,
      senderDeviceId: api.companion.id,
      targetDeviceId: api.tv.id,
      contentId: 'vod:42',
      sourceId,
      action: 'play',
    });
    assert.equal(queued.status, 'queued');
    assert.equal(api.push.sent.length, 1);
    assert.equal(api.push.sent[0]?.status, 'send_to_tv');
    assert.equal(api.push.sent[0]?.data.commandId, queued.commandId);

    let flushedPayload = '';
    await api.bus.subscribe(api.tv.id, (message) => {
      flushedPayload = message;
    });
    const flush = await api.flush.execute(accountId, api.tv.id);
    assert.equal(flush.delivered, 1);
    assert.match(flushedPayload, /"contentId":"vod:42"/);

    const pending = await api.commands.listPendingForTarget(
      accountId,
      api.tv.id,
      new Date(),
    );
    assert.equal(pending.length, 0);
  });

  it('requires an explicit target TV (no multi-TV auto-pick)', async () => {
    const api = await buildStack();
    assert.notEqual(api.tv.id, api.otherTv.id);

    await assert.rejects(
      () =>
        api.sendToTv.execute({
          accountId,
          authenticatedDeviceId: api.companion.id,
          senderDeviceId: api.companion.id,
          targetDeviceId: '',
          contentId: 'x',
          sourceId,
          action: 'play',
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'SEND_TO_TV_FIELDS_INVALID',
    );

    await assert.rejects(
      () =>
        api.sendToTv.execute({
          accountId,
          authenticatedDeviceId: api.companion.id,
          senderDeviceId: api.companion.id,
          targetDeviceId: api.companion.id,
          contentId: 'x',
          sourceId,
          action: 'play',
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'SEND_TO_TV_TARGET_NOT_TV',
    );
  });

  it('rejects sender mismatch, foreign target, and non-play actions', async () => {
    const api = await buildStack();
    const foreignAccount = randomUUID();
    const foreignTv = await new RegisterDevice(
      api.devices,
      api.presence,
    ).execute({
      accountId: foreignAccount,
      deviceType: 'tv',
      platform: 'android_tv',
    });

    await assert.rejects(
      () =>
        api.sendToTv.execute({
          accountId,
          authenticatedDeviceId: api.companion.id,
          senderDeviceId: api.tv.id,
          targetDeviceId: api.tv.id,
          contentId: 'x',
          sourceId,
          action: 'play',
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'SEND_TO_TV_SENDER_MISMATCH',
    );

    await assert.rejects(
      () =>
        api.sendToTv.execute({
          accountId,
          authenticatedDeviceId: api.companion.id,
          senderDeviceId: api.companion.id,
          targetDeviceId: foreignTv.id,
          contentId: 'x',
          sourceId,
          action: 'play',
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'DEVICE_NOT_FOUND',
    );

    await assert.rejects(
      () =>
        api.sendToTv.execute({
          accountId,
          authenticatedDeviceId: api.companion.id,
          senderDeviceId: api.companion.id,
          targetDeviceId: api.tv.id,
          contentId: 'x',
          sourceId,
          action: 'pause',
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'SEND_TO_TV_ACTION_INVALID',
    );
  });

  it('maps HTTP 202 and authz status codes', async () => {
    const api = await buildStack();
    const routes = createDevicesRoutes({
      listDevices: { execute: async () => [] } as never,
      registerDevice: { execute: async () => ({}) } as never,
      unlinkDevice: { execute: async () => undefined } as never,
      deviceHeartbeat: { execute: async () => ({}) } as never,
      notifyCompanionStatusFallback: { execute: async () => ({}) } as never,
      sendToTv: api.sendToTv,
    });
    const route = routes.find(
      (item) => item.path === '/api/v1/devices/{id}/send-to-tv',
    );
    assert.ok(route);

    await api.presence.markConnected(accountId, api.tv.id, 'node-a');
    await api.bus.subscribe(api.tv.id, () => undefined);

    const ok = await route!.handler({
      method: 'POST',
      url: `/api/v1/devices/${api.companion.id}/send-to-tv`,
      headers: {},
      accountId,
      auth: {
        accountId,
        deviceId: api.companion.id,
        roles: ['user'],
        jti: 'jti',
        issuedAtUnix: 1,
        expiresAtUnix: 9999999999,
        kid: 'k',
      },
      params: { id: api.companion.id },
      body: {
        targetDeviceId: api.tv.id,
        contentId: 'ch-1',
        sourceId,
        action: 'play',
      },
    });
    assert.equal(ok.statusCode, 202);
    assert.equal((ok.body as { status: string }).status, 'delivered');

    const forbidden = await route!.handler({
      method: 'POST',
      url: `/api/v1/devices/${api.tv.id}/send-to-tv`,
      headers: {},
      accountId,
      auth: {
        accountId,
        deviceId: api.companion.id,
        roles: ['user'],
        jti: 'jti',
        issuedAtUnix: 1,
        expiresAtUnix: 9999999999,
        kid: 'k',
      },
      params: { id: api.tv.id },
      body: {
        targetDeviceId: api.tv.id,
        contentId: 'ch-1',
        sourceId,
        action: 'play',
      },
    });
    assert.equal(forbidden.statusCode, 403);
  });
});
