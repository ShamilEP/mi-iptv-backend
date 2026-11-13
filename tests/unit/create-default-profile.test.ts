import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { CreateDefaultProfile } from '../../src/application/profiles/create-default-profile.js';
import { toProfilePublicView } from '../../src/application/profiles/profile-public-view.js';
import {
  DEFAULT_PROFILE_AUTOPLAY,
  DEFAULT_PROFILE_LANGUAGE,
  DEFAULT_PROFILE_NAME,
  buildDefaultProfile,
} from '../../src/domain/profiles/default-profile.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { InMemoryProfileRepository } from '../../src/infrastructure/persistence/in-memory-profile-repository.js';

describe('BE-029 CreateDefaultProfile', () => {
  it('seeds one default profile with language and playback defaults', async () => {
    const profiles = new InMemoryProfileRepository();
    const createDefaultProfile = new CreateDefaultProfile(profiles);
    const accountId = randomUUID();

    const profile = await createDefaultProfile.execute({ accountId });

    assert.equal(profile.accountId, accountId);
    assert.equal(profile.name, DEFAULT_PROFILE_NAME);
    assert.equal(profile.language, DEFAULT_PROFILE_LANGUAGE);
    assert.equal(profile.autoplay, DEFAULT_PROFILE_AUTOPLAY);
    assert.equal(profile.isDefault, true);
    assert.equal(profile.avatar, null);
    assert.equal(profile.region, null);
    assert.deepEqual(profile.subtitlePrefs, {});
    assert.deepEqual(profile.restrictions, {});

    const listed = await profiles.listByAccount(accountId);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, profile.id);

    const view = toProfilePublicView(profile);
    assert.equal(view.language, 'es');
    assert.equal(view.autoplay, true);
    assert.equal(view.isDefault, true);
  });

  it('enforces one profile per account in the MVP', async () => {
    const profiles = new InMemoryProfileRepository();
    const createDefaultProfile = new CreateDefaultProfile(profiles);
    const accountId = randomUUID();

    await createDefaultProfile.execute({ accountId });
    await assert.rejects(
      () => createDefaultProfile.execute({ accountId }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'PROFILE_ALREADY_EXISTS',
    );
  });

  it('does not create a profile for a different account when seeding another', async () => {
    const profiles = new InMemoryProfileRepository();
    const createDefaultProfile = new CreateDefaultProfile(profiles);
    const accountA = randomUUID();
    const accountB = randomUUID();

    await createDefaultProfile.execute({ accountId: accountA });
    await createDefaultProfile.execute({ accountId: accountB });

    assert.equal((await profiles.listByAccount(accountA)).length, 1);
    assert.equal((await profiles.listByAccount(accountB)).length, 1);
  });

  it('buildDefaultProfile matches schema defaults', () => {
    const accountId = randomUUID();
    const profileId = randomUUID();
    const seed = buildDefaultProfile(accountId, profileId);
    assert.equal(seed.id, profileId);
    assert.equal(seed.accountId, accountId);
    assert.equal(seed.name, 'Default');
    assert.equal(seed.language, 'es');
    assert.equal(seed.autoplay, true);
    assert.equal(seed.isDefault, true);
  });
});
