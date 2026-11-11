import type { AppEnvironment } from './kms-key-resolver.js';

export type CredentialEncryptionKeyDescriptor = {
  readonly environment: AppEnvironment;
  readonly alias: string;
  /** Key id or ARN reference — never raw key material. */
  readonly keyId: string;
  /** Application DEK rotation interval (days). */
  readonly rotationIntervalDays: number;
  /** Whether the CMK should use AWS automatic annual rotation when live. */
  readonly automaticCmkRotation: boolean;
};

/**
 * Catalog of per-environment KMS keys used for IPTV source-credential encryption.
 */
export interface CredentialEncryptionKeyCatalog {
  get(environment: AppEnvironment): CredentialEncryptionKeyDescriptor;
  list(): readonly CredentialEncryptionKeyDescriptor[];
}
