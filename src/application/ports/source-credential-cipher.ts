/**
 * Envelope encryption for IPTV source credentials at rest (Security §5).
 * Ciphertext is AES-256-GCM; the DEK is KMS-managed (never hardcoded).
 * Never log plaintext or DEK material.
 */
export type SourceCredentialSecrets = {
  readonly username?: string;
  readonly password?: string;
  readonly token?: string;
};

export type EncryptedSourceCredential = {
  /** Opaque blob for `app.user_sources.credentials_encrypted` (BYTEA). */
  readonly ciphertext: Uint8Array;
  /** KMS CMK / DEK version id for `app.user_sources.enc_key_id`. */
  readonly keyId: string;
};

export interface SourceCredentialCipher {
  encrypt(secrets: SourceCredentialSecrets): EncryptedSourceCredential;
  decrypt(ciphertext: Uint8Array): SourceCredentialSecrets;
}
