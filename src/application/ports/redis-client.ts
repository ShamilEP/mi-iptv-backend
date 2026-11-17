/**
 * Port for Redis/Valkey key-value + pub/sub (sessions, deny-list, cache, presence).
 * Infrastructure: `IoredisRedisClient` (`ioredis`). Domain/application never import `ioredis`.
 */
export type RedisSetOptions = {
  readonly ttlSeconds?: number;
};

export type RedisSubscribeHandler = (message: string) => void;

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
  /** Returns the number of subscribers that received the message. */
  publish(channel: string, message: string): Promise<number>;
  /**
   * Subscribe to a Pub/Sub channel. Returns an unsubscribe function.
   * ioredis uses a dedicated subscriber connection behind this adapter.
   */
  subscribe(
    channel: string,
    handler: RedisSubscribeHandler,
  ): Promise<() => void>;
  ping(): Promise<string>;
  close(): Promise<void>;
}
