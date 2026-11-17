import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AnnounceDevicePresence } from '../../src/application/devices/announce-device-presence.js';
import { ListDevices } from '../../src/application/devices/list-devices.js';
import { NotifyCompanionStatusFallback } from '../../src/application/devices/notify-companion-status-fallback.js';
import { RegisterDevice } from '../../src/application/devices/register-device.js';
import { FanOutDeviceCommand } from '../../src/application/realtime/fan-out-device-command.js';
import { InMemoryRedisClient } from '../../src/infrastructure/cache/in-memory-redis-client.js';
import { InMemoryDeviceRepository } from '../../src/infrastructure/persistence/in-memory-device-repository.js';
import { InMemoryPushNotifier } from '../../src/infrastructure/push/in-memory-push-notifier.js';
import { InMemoryDeviceSocketPresence } from '../../src/infrastructure/realtime/in-memory-device-socket-presence.js';
import { RedisRealtimeDeviceBus } from '../../src/infrastructure/realtime/redis-realtime-device-bus.js';

const accountId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

async function buildStack() {
  const devices = new InMemoryDeviceRepository();
  const presence = new InMemoryDeviceSocketPresence();
  const redis = new InMemoryRedisClient();
  const bus = new RedisRealtimeDeviceBus(redis);
  const fanOut = new FanOutDeviceCommand(bus);
  const push = new InMemoryPushNotifier();
  const notify = new NotifyCompanionStatusFallback(devices, presence, push);
  const register = new RegisterDevice(devices, presence);
  const list = new ListDevices(devices, presence);
  const announce = new AnnounceDevicePresence(devices, fanOut, notify);

  const companion = await register.execute({
    accountId,
    deviceType: 'companion',
    platform: 'android',
    name: 'Phone',
    pushToken: 'fcm-companion',
  });
  const tv = await register.execute({
    accountId,
    deviceType: 'tv',
    platform: 'android_tv',
    name: 'Living Room',
  });

  return { devices, presence, bus, fanOut, push, list, announce, companion, tv };
}

describe('Device presence (BE-076)', () => {
  it('exposes online/offline on GET device list from socket presence', async () => {
    const api = await buildStack();

    let listed = await api.list.execute(accountId);
    assert.equal(listed.length, 2);
    assert.ok(listed.every((item) => item.connectionStatus === 'offline'));

    await api.presence.markConnected(accountId, api.tv.id, 'node-a');

    listed = await api.list.execute(accountId);
    const tvView = listed.find((item) => item.id === api.tv.id);
    const companionView = listed.find((item) => item.id === api.companion.id);
    assert.equal(tvView?.connectionStatus, 'online');
    assert.equal(companionView?.connectionStatus, 'offline');
    assert.ok(tvView?.lastSeenAt);
  });

  it('fans out device_presence to peer channels and pushes companions when TV changes', async () => {
    const api = await buildStack();
    const received: string[] = [];
    await api.bus.subscribe(api.companion.id, (message) => {
      received.push(message);
    });

    const online = await api.announce.execute({
      accountId,
      subjectDeviceId: api.tv.id,
      connectionStatus: 'online',
    });
    assert.equal(online.peersNotified, 1);
    assert.equal(online.companionPushSent, 1);
    assert.equal(api.push.sent.length, 1);
    assert.equal(api.push.sent[0]?.status, 'connected');
    assert.equal(received.length, 1);

    const frame = JSON.parse(received[0]!) as {
      type: string;
      payload: {
        type: string;
        subjectDeviceId: string;
        connectionStatus: string;
      };
    };
    assert.equal(frame.type, 'event');
    assert.equal(frame.payload.type, 'device_presence');
    assert.equal(frame.payload.subjectDeviceId, api.tv.id);
    assert.equal(frame.payload.connectionStatus, 'online');

    // Companion with open socket skips push on disconnect announce.
    await api.presence.markConnected(accountId, api.companion.id, 'node-b');
    api.push.sent.length = 0;
    const offline = await api.announce.execute({
      accountId,
      subjectDeviceId: api.tv.id,
      connectionStatus: 'offline',
    });
    assert.equal(offline.companionPushSent, 0);
    assert.equal(api.push.sent.length, 0);
    assert.equal(received.length, 2);
    const offlineFrame = JSON.parse(received[1]!) as {
      payload: { connectionStatus: string };
    };
    assert.equal(offlineFrame.payload.connectionStatus, 'offline');
  });

  it('does not push companions when a companion subject changes presence', async () => {
    const api = await buildStack();
    const result = await api.announce.execute({
      accountId,
      subjectDeviceId: api.companion.id,
      connectionStatus: 'online',
    });
    assert.equal(result.companionPushSent, 0);
    assert.equal(api.push.sent.length, 0);
  });
});

