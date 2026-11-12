import type {
  EncryptedSourceCredential,
  SourceCredentialCipher,
  SourceCredentialSecrets,
} from '../../application/ports/source-credential-cipher.js';

/**
 * DEK rotation helper (SEC-030): encrypt with the new DEK; decrypt tries new then old.
 * Never logs plaintext or DEK material.
 */
export class DualReadSourceCredentialCipher implements SourceCredentialCipher {
  constructor(
    private readonly primary: SourceCredentialCipher,
    private readonly previous: SourceCredentialCipher | null = null,
  ) {}

  encrypt(secrets: SourceCredentialSecrets): EncryptedSourceCredential {
    return this.primary.encrypt(secrets);
  }

  decrypt(ciphertext: Uint8Array): SourceCredentialSecrets {
    try {
      return this.primary.decrypt(ciphertext);
    } catch (primaryError: unknown) {
      if (this.previous === null) {
        throw primaryError;
      }
      return this.previous.decrypt(ciphertext);
    }
  }
}

/**
 * One row of a DEK rotation drill: decrypt (dual-read) then re-encrypt under the new DEK.
 */
export function reencryptSourceCredentialCiphertext(
  ciphertext: Uint8Array,
  dualRead: SourceCredentialCipher,
  newPrimary: SourceCredentialCipher,
): EncryptedSourceCredential {
  const secrets = dualRead.decrypt(ciphertext);
  return newPrimary.encrypt(secrets);
}
