import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DeviceHeartbeat } from '../../src/application/devices/device-heartbeat.js';
import { ListDevices } from '../../src/application/devices/list-devices.js';
import { RegisterDevice } from '../../src/application/devices/register-device.js';
import { UnlinkDevice } from '../../src/application/devices/unlink-device.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { InMemoryDeviceRepository } from '../../src/infrastructure/persistence/in-memory-device-repository.js';

const accountId = '22222222-2222-2222-2222-222222222222';

function buildApi() {
  const repo = new InMemoryDeviceRepository();
  return {
    register: new RegisterDevice(repo),
    list: new ListDevices(repo),
    unlink: new UnlinkDevice(repo),
    heartbeat: new DeviceHeartbeat(repo),
  };
}

describe('Device registration (BE-075)', () => {
  it('registers, lists, heartbeats, and unlinks devices without exposing push tokens', async () => {
    const api = buildApi();
    const tv = await api.register.execute({
      accountId,
      deviceType: 'tv',
      platform: 'android_tv',
      name: 'Salon TV',
      pushToken: 'fcm-tv-token-secret',
    });
    assert.equal(tv.deviceType, 'tv');
    assert.equal(tv.platform, 'android_tv');
    assert.equal(tv.pushTokenConfigured, true);
    assert.equal(Object.prototype.hasOwnProperty.call(tv, 'pushToken'), false);
    assert.ok(tv.lastSeenAt);

    const companion = await api.register.execute({
      accountId,
      deviceType: 'companion',
      platform: 'ios',
      name: 'Phone',
      pushToken: 'apns-secret',
    });
    assert.equal(companion.deviceType, 'companion');

    const listed = await api.list.execute(accountId);
    assert.equal(listed.length, 2);
    assert.ok(listed.every((item) => item.pushTokenConfigured));

    const before = tv.lastSeenAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const beat = await api.heartbeat.execute({
      accountId,
      deviceId: tv.id,
      pushToken: 'fcm-rotated',
    });
    assert.equal(beat.pushTokenConfigured, true);
    assert.notEqual(beat.lastSeenAt, before);

    await api.unlink.execute(accountId, companion.id);
    assert.equal((await api.list.execute(accountId)).length, 1);
  });

  it('rejects invalid device type/platform pairs', async () => {
    const api = buildApi();
    await assert.rejects(
      () =>
        api.register.execute({
          accountId,
          deviceType: 'tv',
          platform: 'ios',
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'DEVICE_TYPE_PLATFORM_MISMATCH',
    );
  });
});
