import { Redis } from 'ioredis';
import type {
  RedisClient,
  RedisSetOptions,
  RedisSubscribeHandler,
} from '../../application/ports/redis-client.js';

export type IoredisRedisClientOptions = {
  readonly url: string;
  readonly maxRetriesPerRequest?: number;
  readonly enableOfflineQueue?: boolean;
  readonly lazyConnect?: boolean;
};

/**
 * Redis/Valkey adapter using approved `ioredis`.
 * Prefer separate instances for session (`REDIS_URL`) vs cache (`REDIS_CACHE_URL`).
 * Pub/Sub subscribe uses a dedicated duplicate connection (Redis subscriber mode).
 */
export class IoredisRedisClient implements RedisClient {
  private readonly client: Redis;
  private readonly options: IoredisRedisClientOptions;
  private subscriber: Redis | null = null;
  private readonly channelHandlers = new Map<
    string,
    Set<RedisSubscribeHandler>
  >();

  constructor(options: IoredisRedisClientOptions) {
    this.options = options;
    this.client = new Redis(options.url, {
      maxRetriesPerRequest: options.maxRetriesPerRequest ?? 1,
      enableOfflineQueue: options.enableOfflineQueue ?? false,
      lazyConnect: options.lazyConnect ?? true,
      retryStrategy: () => null,
    });
    // Avoid process-level unhandled 'error' when Redis is down during boot/tests.
    this.client.on('error', () => {
      /* surfaced by command promises */
    });
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnected(this.client);
    return await this.client.get(key);
  }

  async set(
    key: string,
    value: string,
    options?: RedisSetOptions,
  ): Promise<void> {
    await this.ensureConnected(this.client);
    const ttl = options?.ttlSeconds;
    if (ttl !== undefined && ttl > 0) {
      await this.client.set(key, value, 'EX', ttl);
      return;
    }
    await this.client.set(key, value);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }
    await this.ensureConnected(this.client);
    return await this.client.del(...keys);
  }

  async incr(key: string): Promise<number> {
    await this.ensureConnected(this.client);
    return await this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    await this.ensureConnected(this.client);
    const result = await this.client.expire(key, ttlSeconds);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    await this.ensureConnected(this.client);
    return await this.client.ttl(key);
  }

  async publish(channel: string, message: string): Promise<number> {
    await this.ensureConnected(this.client);
    return await this.client.publish(channel, message);
  }

  async subscribe(
    channel: string,
    handler: RedisSubscribeHandler,
  ): Promise<() => void> {
    await this.ensureSubscriber();
    let set = this.channelHandlers.get(channel);
    const firstOnChannel = set === undefined;
    if (set === undefined) {
      set = new Set<RedisSubscribeHandler>();
      this.channelHandlers.set(channel, set);
    }
    set.add(handler);
    if (firstOnChannel) {
      await this.subscriber!.subscribe(channel);
    }
    return () => {
      const current = this.channelHandlers.get(channel);
      if (!current) {
        return;
      }
      current.delete(handler);
      if (current.size === 0) {
        this.channelHandlers.delete(channel);
        void this.subscriber?.unsubscribe(channel);
      }
    };
  }

  async ping(): Promise<string> {
    await this.ensureConnected(this.client);
    return await this.client.ping();
  }

  async close(): Promise<void> {
    this.channelHandlers.clear();
    if (this.subscriber !== null) {
      await this.quitOrDisconnect(this.subscriber);
      this.subscriber = null;
    }
    await this.quitOrDisconnect(this.client);
  }

  private async ensureSubscriber(): Promise<void> {
    if (this.subscriber !== null) {
      await this.ensureConnected(this.subscriber);
      return;
    }
    const sub = this.client.duplicate({
      maxRetriesPerRequest: this.options.maxRetriesPerRequest ?? 1,
      enableOfflineQueue: this.options.enableOfflineQueue ?? false,
      lazyConnect: this.options.lazyConnect ?? true,
      retryStrategy: () => null,
    });
    sub.on('error', () => {
      /* surfaced by command promises */
    });
    sub.on('message', (channel: string, message: string) => {
      const handlers = this.channelHandlers.get(channel);
      if (!handlers) {
        return;
      }
      for (const handler of [...handlers]) {
        handler(message);
      }
    });
    this.subscriber = sub;
    await this.ensureConnected(sub);
  }

  private async ensureConnected(client: Redis): Promise<void> {
    if (client.status === 'wait' || client.status === 'end') {
      await client.connect();
    }
  }

  private async quitOrDisconnect(client: Redis): Promise<void> {
    if (client.status === 'end' || client.status === 'close') {
      return;
    }
    if (client.status === 'wait' || client.status === 'connecting') {
      client.disconnect(false);
      return;
    }
    await client.quit();
  }
}

export function createIoredisRedisClientFromUrl(
  url: string | undefined,
): IoredisRedisClient | null {
  const trimmed = url?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return null;
  }
  return new IoredisRedisClient({ url: trimmed });
}
