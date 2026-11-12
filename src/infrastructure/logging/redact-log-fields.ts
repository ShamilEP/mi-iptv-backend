const REDACTED = '[REDACTED]';

/** Exact field names (compared case-insensitively). */
const SENSITIVE_EXACT = new Set(
  [
    'password',
    'passwd',
    'secret',
    'token',
    'accesstoken',
    'refreshtoken',
    'authorization',
    'apikey',
    'privatekey',
    'publickey',
    'credential',
    'credentials',
    'sourcepassword',
    'sourcecredentials',
    'datakey',
    'jwt',
    'cookie',
    'set-cookie',
    'database_url',
    'databaseurl',
    'redis_url',
    'redisurl',
    'jwt_private_key',
    'jwtprivatekey',
    'jwt_public_key',
    'jwtpublickey',
    'source_credentials_data_key',
    'sourcecredentialsdatakey',
    'passwordhash',
    'pin_hash',
    'pinhash',
  ].map((name) => name.toLowerCase()),
);

/** Suffix / substring patterns for compound names (e.g. xtreamPassword). */
const SENSITIVE_SUBSTRINGS = [
  'password',
  'secret',
  'token',
  'credential',
  'privatekey',
  'apikey',
] as const;

const URL_USERINFO = /^([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+):([^/@\s]*)@(.+)$/i;

export function isSensitiveFieldName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (
    SENSITIVE_EXACT.has(normalized) ||
    SENSITIVE_EXACT.has(name.toLowerCase())
  ) {
    return true;
  }
  return SENSITIVE_SUBSTRINGS.some((part) => normalized.includes(part));
}

export function redactStringValue(value: string): string {
  const match = URL_USERINFO.exec(value);
  if (!match) {
    return value;
  }
  return `${match[1]}***:***@${match[4]}`;
}

/**
 * Recursively redacts sensitive keys and credential-bearing URLs for structured logs.
 * Policy: docs/security/003-secrets-and-logging-policy.md (SEC-003).
 */
export function redactLogFields(
  fields: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = isSensitiveFieldName(key) ? REDACTED : redactUnknown(value);
  }
  return out;
}

function redactUnknown(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return redactStringValue(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }
  if (typeof value === 'object') {
    return redactLogFields(value as Record<string, unknown>);
  }
  return value;
}
