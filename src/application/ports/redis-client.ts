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
  publish(channel: string, message: string): Promise<number>;
  ping(): Promise<string>;
  close(): Promise<void>;
}
