import { Algorithm, hash, verify } from '@node-rs/argon2';
import type {
  Argon2idHashParams,
  PasswordHasher,
} from '../../application/ports/password-hasher.js';
import { assertPasswordMeetsPolicy } from '../../domain/auth/password-policy.js';

/**
 * Argon2id password hasher (Security §2.1) via approved `@node-rs/argon2`.
 * Plaintext passwords are never logged or stored — only PHC-encoded hashes leave this adapter.
 * `hash` enforces the §2.1 complexity policy before Argon2 runs (SEC-010).
 * `hashOpaque` skips account password policy (parental PIN — BE-037).
 */
export class Argon2PasswordHasher implements PasswordHasher {
  constructor(private readonly params: Argon2idHashParams) {
    if (params.algorithm !== 'argon2id') {
      throw new Error(
        `Unsupported password hash algorithm: ${params.algorithm}`,
      );
    }
  }

  async hash(plainPassword: string): Promise<string> {
    assertNonEmptyPassword(plainPassword);
    assertPasswordMeetsPolicy(plainPassword);
    return this.hashArgon2id(plainPassword);
  }

  async hashOpaque(plainSecret: string): Promise<string> {
    assertNonEmptyPassword(plainSecret);
    return this.hashArgon2id(plainSecret);
  }

  async verify(plainPassword: string, passwordHash: string): Promise<boolean> {
    assertNonEmptyPassword(plainPassword);
    if (passwordHash.trim() === '') {
      return false;
    }
    try {
      return await verify(passwordHash, plainPassword);
    } catch {
      // Malformed PHC / unexpected library errors → treat as non-match (no plaintext in errors).
      return false;
    }
  }

  private hashArgon2id(plain: string): Promise<string> {
    return hash(plain, {
      algorithm: Algorithm.Argon2id,
      memoryCost: this.params.memoryKiB,
      timeCost: this.params.timeCost,
      parallelism: this.params.parallelism,
    });
  }
}

function assertNonEmptyPassword(plainPassword: string): void {
  if (plainPassword.length === 0) {
    throw new Error('Password must not be empty');
  }
}
