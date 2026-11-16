/**
 * Per-profile syncable settings document (SRS §7 / BE-106 / `app.profile_settings`).
 */

export type ProfileSettings = {
  readonly profileId: string;
  readonly accountId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly syncVersion: number;
  readonly changeSeq: number;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/**
 * Keys eligible for cross-device sync (SRS “settings flagged syncable”).
 * Device-local prefs outside this set are ignored on write and omitted on read.
 */
export const SYNCABLE_SETTING_KEYS = [
  'autoplay',
  'subtitlePrefs',
  'language',
  'region',
  'historyEnabled',
  'restrictions',
] as const;

export type SyncableSettingKey = (typeof SYNCABLE_SETTING_KEYS)[number];

const SYNCABLE_KEY_SET = new Set<string>(SYNCABLE_SETTING_KEYS);

export function isSyncableSettingKey(key: string): key is SyncableSettingKey {
  return SYNCABLE_KEY_SET.has(key);
}

/** Keeps only syncable keys from an untrusted client patch. */
export function filterSyncableSettings(
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SYNCABLE_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      out[key] = input[key];
    }
  }
  return out;
}

/**
 * Field-level merge (SRS §7 LWW por campo): incoming syncable keys overwrite;
 * other existing keys are preserved.
 */
export function mergeSettingsPayload(
  existing: Readonly<Record<string, unknown>>,
  incomingSyncable: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    ...filterSyncableSettings(existing),
    ...filterSyncableSettings(incomingSyncable),
  };
}
