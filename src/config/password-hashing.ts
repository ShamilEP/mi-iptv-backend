import type { Argon2idHashParams } from '../application/ports/password-hasher.js';

/** OWASP-aligned defaults for interactive login hashing. */
export const DEFAULT_ARGON2ID_PARAMS: Argon2idHashParams = {
  algorithm: 'argon2id',
  memoryKiB: 65_536,
  timeCost: 3,
  parallelism: 1,
};

/**
 * Loads Argon2id cost parameters from env (names only — no secrets).
 * Rejects values below safe floors so misconfig cannot weaken hashing silently.
 */
export function loadPasswordHashParams(
  env: NodeJS.ProcessEnv = process.env,
): Argon2idHashParams {
  const memoryKiB = parsePositiveInt(
    env.PASSWORD_ARGON2_MEMORY_KIB,
    DEFAULT_ARGON2ID_PARAMS.memoryKiB,
    'PASSWORD_ARGON2_MEMORY_KIB',
  );
  const timeCost = parsePositiveInt(
    env.PASSWORD_ARGON2_TIME_COST,
    DEFAULT_ARGON2ID_PARAMS.timeCost,
    'PASSWORD_ARGON2_TIME_COST',
  );
  const parallelism = parsePositiveInt(
    env.PASSWORD_ARGON2_PARALLELISM,
    DEFAULT_ARGON2ID_PARAMS.parallelism,
    'PASSWORD_ARGON2_PARALLELISM',
  );

  if (memoryKiB < 19_456) {
    throw new Error(
      'PASSWORD_ARGON2_MEMORY_KIB must be >= 19456 (OWASP minimum for Argon2id)',
    );
  }
  if (timeCost < 2) {
    throw new Error('PASSWORD_ARGON2_TIME_COST must be >= 2');
  }
  if (parallelism < 1) {
    throw new Error('PASSWORD_ARGON2_PARALLELISM must be >= 1');
  }

  return {
    algorithm: 'argon2id',
    memoryKiB,
    timeCost,
    parallelism,
  };
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return value;
}
