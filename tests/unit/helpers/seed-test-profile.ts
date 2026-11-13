import { InMemoryProfileRepository } from '../../../src/infrastructure/persistence/in-memory-profile-repository.js';

export async function seedTestProfile(
  profiles: InMemoryProfileRepository,
  accountId: string,
  profileId: string,
  options?: {
    readonly name?: string;
    readonly isDefault?: boolean;
  },
): Promise<void> {
  await profiles.insert({
    id: profileId,
    accountId,
    name: options?.name ?? 'Test',
    avatar: null,
    language: 'es',
    region: null,
    isDefault: options?.isDefault ?? true,
    autoplay: true,
    subtitlePrefs: {},
    restrictions: {},
    pinHash: null,
  });
}
