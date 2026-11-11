import type {
  AppEnvironment,
  KmsKeyResolver,
} from '../application/ports/kms-key-resolver.js';
import type { SecretStore } from '../application/ports/secret-store.js';
import { getEnvironmentDefaults } from './environments/index.js';

export type AppConfig = {
  readonly appEnv: AppEnvironment;
  readonly nodeEnv: string;
  readonly port: number;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** KMS key id/ARN for this environment — never key material. */
  readonly kmsKeyId: string;
};

export type InjectedSecrets = {
  readonly databaseUrl: string | undefined;
  readonly redisUrl: string | undefined;
  readonly jwtPrivateKey: string | undefined;
  readonly jwtPublicKey: string | undefined;
  readonly sourceCredentialsDataKey: string | undefined;
};

const APP_ENVS = new Set<AppEnvironment>(['dev', 'qa', 'prod']);

/**
 * Reads non-secret configuration from `process.env` only.
 * Agents must never open `.env*` files; local tooling may load them into the process.
 * Per-environment defaults come from `src/config/environments/*`.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  kmsKeyResolver?: KmsKeyResolver,
): AppConfig {
  const appEnv = parseAppEnv(env.APP_ENV ?? inferAppEnv(env.NODE_ENV));
  const defaults = getEnvironmentDefaults(appEnv);

  const portRaw = env.PORT ?? String(defaults.defaultPort);
  const port = Number.parseInt(portRaw, 10);

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${portRaw}`);
  }

  const kmsKeyId = kmsKeyResolver
    ? kmsKeyResolver.resolveKeyId(appEnv)
    : requireEnvStyle(env.KMS_KEY_ID);

  if (!kmsKeyId) {
    throw new Error(
      'KMS key id missing: pass KmsKeyResolver or set KMS_KEY_ID',
    );
  }

  const logLevel = parseLogLevel(env.LOG_LEVEL ?? defaults.logLevel);

  return {
    appEnv,
    nodeEnv: env.NODE_ENV ?? 'development',
    port,
    logLevel,
    kmsKeyId,
  };
}

/**
 * Resolves injected secrets for the active environment via SecretStore
 * (INF-013 env-injected mock or later AWS Secrets Manager adapter).
 * Secret values are for composition only — never log them.
 */
export async function loadInjectedSecrets(
  appEnv: AppEnvironment,
  secretStore: SecretStore,
): Promise<InjectedSecrets> {
  const prefix = `mi-iptv/${appEnv}`;
  const [
    databaseUrl,
    redisUrl,
    jwtPrivateKey,
    jwtPublicKey,
    sourceCredentialsDataKey,
  ] = await Promise.all([
    secretStore.getSecret(`${prefix}/database_url`),
    secretStore.getSecret(`${prefix}/redis_url`),
    secretStore.getSecret(`${prefix}/jwt_private_key`),
    secretStore.getSecret(`${prefix}/jwt_public_key`),
    secretStore.getSecret(`${prefix}/source_credentials_data_key`),
  ]);

  return {
    databaseUrl,
    redisUrl,
    jwtPrivateKey,
    jwtPublicKey,
    sourceCredentialsDataKey,
  };
}

function parseAppEnv(raw: string): AppEnvironment {
  const normalized = raw.trim().toLowerCase();
  if (!APP_ENVS.has(normalized as AppEnvironment)) {
    throw new Error(`Invalid APP_ENV: ${raw} (expected dev|qa|prod)`);
  }
  return normalized as AppEnvironment;
}

function inferAppEnv(nodeEnv: string | undefined): AppEnvironment {
  if (nodeEnv === 'production') {
    return 'prod';
  }
  if (nodeEnv === 'test') {
    return 'qa';
  }
  return 'dev';
}

function parseLogLevel(raw: string): 'debug' | 'info' | 'warn' | 'error' {
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === 'debug' ||
    normalized === 'info' ||
    normalized === 'warn' ||
    normalized === 'error'
  ) {
    return normalized;
  }
  throw new Error(`Invalid LOG_LEVEL: ${raw}`);
}

function requireEnvStyle(value: string | undefined): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  return value;
}
