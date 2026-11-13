import type {
  RedisClient,
  RedisSetOptions,
} from '../../application/ports/redis-client.js';

type Entry = {
  value: string;
  expiresAtMs: number | null;
};

/**
 * Process-local Redis stand-in for Sprint 0 / unit tests when `REDIS_URL` is unset.
 */
export class InMemoryRedisClient implements RedisClient {
  private readonly store = new Map<string, Entry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAtMs !== null && entry.expiresAtMs <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(
    key: string,
    value: string,
    options?: RedisSetOptions,
  ): Promise<void> {
    const ttl = options?.ttlSeconds;
    this.store.set(key, {
      value,
      expiresAtMs:
        ttl !== undefined && ttl > 0 ? Date.now() + ttl * 1000 : null,
    });
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.store.delete(key)) {
        removed += 1;
      }
    }
    return removed;
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const next = (current === null ? 0 : Number(current)) + 1;
    const existing = this.store.get(key);
    this.store.set(key, {
      value: String(next),
      expiresAtMs: existing?.expiresAtMs ?? null,
    });
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }
    if (entry.expiresAtMs !== null && entry.expiresAtMs <= Date.now()) {
      this.store.delete(key);
      return false;
    }
    this.store.set(key, {
      value: entry.value,
      expiresAtMs: Date.now() + ttlSeconds * 1000,
    });
    return true;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) {
      return -2;
    }
    if (entry.expiresAtMs === null) {
      return -1;
    }
    const remainingMs = entry.expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      this.store.delete(key);
      return -2;
    }
    return Math.ceil(remainingMs / 1000);
  }

  async publish(_channel: string, _message: string): Promise<number> {
    return 0;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}
