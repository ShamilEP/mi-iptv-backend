import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotifyCompanionStatusFallback } from '../../src/application/devices/notify-companion-status-fallback.js';
import { RegisterDevice } from '../../src/application/devices/register-device.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { InMemoryDeviceRepository } from '../../src/infrastructure/persistence/in-memory-device-repository.js';
import { InMemoryPushNotifier } from '../../src/infrastructure/push/in-memory-push-notifier.js';
import { InMemoryDeviceSocketPresence } from '../../src/infrastructure/realtime/in-memory-device-socket-presence.js';
import { createDevicesRoutes } from '../../src/presentation/http/routes/devices-routes.js';
import { DeviceHeartbeat } from '../../src/application/devices/device-heartbeat.js';
import { ListDevices } from '../../src/application/devices/list-devices.js';
import { UnlinkDevice } from '../../src/application/devices/unlink-device.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tvIdSubject = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function buildStack() {
  const devices = new InMemoryDeviceRepository();
  const presence = new InMemoryDeviceSocketPresence();
  const push = new InMemoryPushNotifier();
  const notify = new NotifyCompanionStatusFallback(devices, presence, push);
  const register = new RegisterDevice(devices);
  return { devices, presence, push, notify, register };
}

describe('NotifyCompanionStatusFallback (BE-081)', () => {
  it('sends connected / disconnected / pairing_error when no socket is open', async () => {
    const api = buildStack();
    const android = await api.register.execute({
      accountId,
      deviceType: 'companion',
      platform: 'android',
      pushToken: 'fcm-token-secret',
    });
    const ios = await api.register.execute({
      accountId,
      deviceType: 'companion',
      platform: 'ios',
      pushToken: 'apns-token-secret',
    });
    await api.register.execute({
      accountId,
      deviceType: 'tv',
      platform: 'android_tv',
      pushToken: 'tv-token-ignored',
    });

    for (const status of [
      'connected',
      'disconnected',
      'pairing_error',
    ] as const) {
      api.push.sent.length = 0;
      const result = await api.notify.execute({
        accountId,
        status,
        subjectDeviceId: tvIdSubject,
      });
      assert.equal(result.status, status);
      assert.equal(result.sent, 2);
      assert.equal(api.push.sent.length, 2);
      assert.ok(api.push.sent.some((row) => row.deviceId === android.id));
      assert.ok(api.push.sent.some((row) => row.deviceId === ios.id));
      assert.equal(
        api.push.sent.find((row) => row.deviceId === android.id)?.channel,
        'fcm',
      );
      assert.equal(
        api.push.sent.find((row) => row.deviceId === ios.id)?.channel,
        'apns',
      );
      assert.ok(
        api.push.sent.every((row) => !('pushToken' in row)),
      );
    }
  });

  it('skips companions with an open socket and devices without tokens', async () => {
    const api = buildStack();
    const online = await api.register.execute({
      accountId,
      deviceType: 'companion',
      platform: 'android',
      pushToken: 'online-token',
    });
    await api.register.execute({
      accountId,
      deviceType: 'companion',
      platform: 'ios',
    });
    api.presence.markOpen(accountId, online.id);

    const result = await api.notify.execute({
      accountId,
      status: 'disconnected',
    });
    assert.equal(result.sent, 0);
    assert.equal(result.attempted.length, 2);
    assert.equal(
      result.attempted.find((row) => row.deviceId === online.id)
        ?.skippedBecauseSocketOpen,
      true,
    );
    assert.ok(
      result.attempted.some((row) => row.skippedBecauseNoToken),
    );
    assert.equal(api.push.sent.length, 0);
  });

  it('rejects invalid status values', async () => {
    const api = buildStack();
    await assert.rejects(
      () =>
        api.notify.execute({
          accountId,
          status: 'online',
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'COMPANION_STATUS_INVALID',
    );
  });
});

describe('POST /api/v1/devices/companion-status (BE-081)', () => {
  it('is catalogued and maps the use case without exposing tokens', async () => {
    assert.ok(
      ROUTE_CATALOG.some(
        (entry) =>
          entry.method === 'POST' &&
          entry.path === '/api/v1/devices/companion-status',
      ),
    );

    const api = buildStack();
    await api.register.execute({
      accountId,
      deviceType: 'companion',
      platform: 'android',
      pushToken: 'route-token',
    });
    const routes = createDevicesRoutes({
      listDevices: new ListDevices(api.devices),
      registerDevice: api.register,
      unlinkDevice: new UnlinkDevice(api.devices),
      deviceHeartbeat: new DeviceHeartbeat(api.devices),
      notifyCompanionStatusFallback: api.notify,
    });
    const route = routes.find(
      (entry) =>
        entry.method === 'POST' &&
        entry.path === '/api/v1/devices/companion-status',
    );
    assert.ok(route);

    const response = await route.handler({
      method: 'POST',
      url: '/api/v1/devices/companion-status',
      headers: { 'x-account-id': accountId },
      accountId,
      body: { status: 'connected', subjectDeviceId: tvIdSubject },
    });
    assert.equal(response.statusCode, 200);
    const body = response.body as {
      sent: number;
      attempted: Array<Record<string, unknown>>;
    };
    assert.equal(body.sent, 1);
    assert.equal(body.attempted[0]?.channel, 'fcm');
    assert.equal(
      JSON.stringify(body).includes('route-token'),
      false,
    );
  });
});
