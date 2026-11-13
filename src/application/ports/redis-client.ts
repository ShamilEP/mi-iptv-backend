/**
 * Port for Redis/Valkey key-value + pub/sub (sessions, deny-list, cache, presence).
 * Infrastructure: `IoredisRedisClient` (`ioredis`). Domain/application never import `ioredis`.
 */
export type RedisSetOptions = {
  readonly ttlSeconds?: number;
};

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: RedisSetOptions): Promise<void>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<boolean>;
  /**
   * Remaining TTL in whole seconds.
   * `-2` = missing key; `-1` = no expiry (Redis convention).
   */
  ttl(key: string): Promise<number>;
  publish(channel: string, message: string): Promise<number>;
  ping(): Promise<string>;
  close(): Promise<void>;
}
