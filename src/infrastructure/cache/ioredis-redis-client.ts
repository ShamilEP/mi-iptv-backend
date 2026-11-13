import { Redis } from 'ioredis';
import type {
  RedisClient,
  RedisSetOptions,
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
 */
export class IoredisRedisClient implements RedisClient {
  private readonly client: Redis;

  constructor(options: IoredisRedisClientOptions) {
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
    await this.ensureConnected();
    return await this.client.get(key);
  }

  async set(
    key: string,
    value: string,
    options?: RedisSetOptions,
  ): Promise<void> {
    await this.ensureConnected();
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
    await this.ensureConnected();
    return await this.client.del(...keys);
  }

  async incr(key: string): Promise<number> {
    await this.ensureConnected();
    return await this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    await this.ensureConnected();
    const result = await this.client.expire(key, ttlSeconds);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    await this.ensureConnected();
    return await this.client.ttl(key);
  }

  async publish(channel: string, message: string): Promise<number> {
    await this.ensureConnected();
    return await this.client.publish(channel, message);
  }

  async ping(): Promise<string> {
    await this.ensureConnected();
    return await this.client.ping();
  }

  async close(): Promise<void> {
    if (this.client.status === 'end' || this.client.status === 'close') {
      return;
    }
    if (this.client.status === 'wait' || this.client.status === 'connecting') {
      this.client.disconnect(false);
      return;
    }
    await this.client.quit();
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect();
    }
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
