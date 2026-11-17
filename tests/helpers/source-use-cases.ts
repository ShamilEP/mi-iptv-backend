import { randomBytes } from 'node:crypto';
import { CreateSource } from '../../src/application/sources/create-source.js';
import { DeleteSource } from '../../src/application/sources/delete-source.js';
import { ListSources } from '../../src/application/sources/list-sources.js';
import { UpdateSource } from '../../src/application/sources/update-source.js';
import { ValidateSourceUrl } from '../../src/application/sources/validate-source-url.js';
import { Aes256GcmSourceCredentialCipher } from '../../src/infrastructure/crypto/aes256-gcm-source-credential-cipher.js';
import { InMemoryAccountSyncClock } from '../../src/infrastructure/persistence/in-memory-account-sync-clock.js';
import { InMemorySourceRepository } from '../../src/infrastructure/persistence/in-memory-source-repository.js';
import { AllowingDns } from './allowing-dns.js';

export function createAllowingValidateSourceUrl(
  overrides: Readonly<Record<string, readonly string[]>> = {},
): ValidateSourceUrl {
  return new ValidateSourceUrl(new AllowingDns(overrides));
}

export function buildSourceRegistryApi(
  overrides: Readonly<Record<string, readonly string[]>> = {},
) {
  const repo = new InMemorySourceRepository();
  const cipher = new Aes256GcmSourceCredentialCipher(
    randomBytes(32),
    'arn:aws:kms:us-east-1:000000000001:key/mock-dev-source-creds',
  );
  const clock = new InMemoryAccountSyncClock();
  const validateSourceUrl = createAllowingValidateSourceUrl(overrides);
  return {
    repo,
    cipher,
    clock,
    validateSourceUrl,
    create: new CreateSource(repo, cipher, clock, validateSourceUrl),
    list: new ListSources(repo),
    update: new UpdateSource(repo, cipher, clock, validateSourceUrl),
    remove: new DeleteSource(repo, clock),
  };
}
