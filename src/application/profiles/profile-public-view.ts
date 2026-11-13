import type { Profile } from '../../domain/profiles/profile.js';
import {
  parseParentalRestrictions,
  type ParentalRestrictions,
} from '../../domain/profiles/parental-restrictions.js';

export type ProfilePublicView = {
  readonly id: string;
  readonly name: string;
  readonly avatar: string | null;
  readonly language: string;
  readonly region: string | null;
  readonly isDefault: boolean;
  readonly autoplay: boolean;
  readonly subtitlePrefs: Readonly<Record<string, unknown>>;
  readonly restrictions: ParentalRestrictions;
  /** True when a parental PIN is set — never includes the hash or clear PIN. */
  readonly pinConfigured: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export function toProfilePublicView(profile: Profile): ProfilePublicView {
  return {
    id: profile.id,
    name: profile.name,
    avatar: profile.avatar,
    language: profile.language,
    region: profile.region,
    isDefault: profile.isDefault,
    autoplay: profile.autoplay,
    subtitlePrefs: profile.subtitlePrefs,
    restrictions: parseParentalRestrictions(profile.restrictions),
    pinConfigured:
      profile.pinHash !== null && profile.pinHash.trim().length > 0,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}
