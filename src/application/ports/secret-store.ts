/**
 * Port for retrieving secret material by logical name.
 * Infrastructure adapters: env-injected mock (Sprint 0) or AWS Secrets Manager (later).
 */
export interface SecretStore {
  getSecret(secretName: string): Promise<string | undefined>;
}
