import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { FanOutDeviceCommand } from '../../src/application/realtime/fan-out-device-command.js';
import { deviceChannel } from '../../src/domain/realtime/realtime-protocol.js';
import { InMemoryRedisClient } from '../../src/infrastructure/cache/in-memory-redis-client.js';
import { RedisRealtimeDeviceBus } from '../../src/infrastructure/realtime/redis-realtime-device-bus.js';

describe('BE-078 Redis Pub/Sub fan-out', () => {
  it('routes a command from a publisher node to the node holding the TV socket', async () => {
    // Shared Redis = multi-node session instance; two buses = two BFF nodes.
    const redis = new InMemoryRedisClient();
    const nodeHoldingTv = new RedisRealtimeDeviceBus(redis);
    const companionApiNode = new RedisRealtimeDeviceBus(redis);
    const tvDeviceId = randomUUID();

    let delivered = '';
    const unsubscribe = await nodeHoldingTv.subscribe(tvDeviceId, (message) => {
      delivered = message;
    });

    const fanOut = new FanOutDeviceCommand(companionApiNode);
    const result = await fanOut.execute({
      targetDeviceId: tvDeviceId,
      payload: { action: 'play', contentId: 'ch-1' },
    });

    assert.equal(result.channel, deviceChannel(tvDeviceId));
    assert.equal(result.subscriberCount, 1);
    assert.match(delivered, /"action":"play"/);
    assert.match(delivered, /"contentId":"ch-1"/);
    assert.match(delivered, new RegExp(`"channel":"${deviceChannel(tvDeviceId)}"`));

    unsubscribe();
    const afterUnsub = await fanOut.execute({
      targetDeviceId: tvDeviceId,
      payload: { action: 'pause' },
    });
    assert.equal(afterUnsub.subscriberCount, 0);
  });

  it('publishes on the Backend §5.2 channel name via RedisClient', async () => {
    const redis = new InMemoryRedisClient();
    const bus = new RedisRealtimeDeviceBus(redis);
    const deviceId = randomUUID();
    const channel = deviceChannel(deviceId);

    let seenChannel = '';
    let seenMessage = '';
    await redis.subscribe(channel, (message) => {
      seenChannel = channel;
      seenMessage = message;
    });

    const count = await bus.publish(deviceId, '{"type":"event"}');
    assert.equal(count, 1);
    assert.equal(seenChannel, channel);
    assert.equal(seenMessage, '{"type":"event"}');
  });

  it('does not deliver to a node that never subscribed (no local socket)', async () => {
    const redis = new InMemoryRedisClient();
    const holdingNode = new RedisRealtimeDeviceBus(redis);
    const idleNode = new RedisRealtimeDeviceBus(redis);
    const deviceId = randomUUID();

    let holdingReceived = false;
    await holdingNode.subscribe(deviceId, () => {
      holdingReceived = true;
    });
    // idleNode never subscribes — simulates BFF without the TV socket.

    const count = await idleNode.publish(deviceId, 'ping');
    assert.equal(holdingReceived, true);
    assert.equal(count, 1);
  });
});
