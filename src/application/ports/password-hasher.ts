/**
 * Password hashing for account credentials (Security §2.1 / NFR-013).
 * Implementations must use Argon2id (preferred) or bcrypt with cost ≥ 12.
 * Never log or persist the plaintext password — only the returned PHC hash.
 */
export type Argon2idHashParams = {
  readonly algorithm: 'argon2id';
  /** Memory cost in KiB. */
  readonly memoryKiB: number;
  /** Time cost (iterations). */
  readonly timeCost: number;
  /** Parallelism (lanes). */
  readonly parallelism: number;
};

export type PasswordHashParams = Argon2idHashParams;

export interface PasswordHasher {
  /** Returns a PHC-encoded hash string suitable for `app.accounts.password_hash`. */
  hash(plainPassword: string): Promise<string>;

  /**
   * Returns true when `plainPassword` matches `passwordHash`.
   * Must not throw on mismatch; must not log either argument.
   */
  verify(plainPassword: string, passwordHash: string): Promise<boolean>;
}
