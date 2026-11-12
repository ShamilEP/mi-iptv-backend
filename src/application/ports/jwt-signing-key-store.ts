/**
 * RS256 signing material from the secret manager (INF-013), with kid rotation.
 */
export type JwtSigningKeyPair = {
  readonly kid: string;
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
};

export interface JwtSigningKeyStore {
  /** Active key used to sign new access tokens. */
  getActiveSigningKey(): JwtSigningKeyPair;

  /** Public key for a kid (active or previous) for verification. */
  getPublicKeyPem(kid: string): string | null;

  /** All known kids (active first) — useful for JWKS later. */
  listKids(): readonly string[];
}
