import type { Account } from '../../domain/auth/account.js';
import type { Profile } from '../../domain/profiles/profile.js';
import {
  parseParentalRestrictions,
  type ParentalRestrictions,
} from '../../domain/profiles/parental-restrictions.js';
import type { Device } from '../../domain/devices/device.js';
import type { UserSource } from '../../domain/sources/user-source.js';
import type { Favorite } from '../../domain/sync/favorite.js';
import type { PlaybackState } from '../../domain/sync/playback-state.js';
import { toSourcePublicView } from '../sources/source-public-view.js';
import { toFavoritePublicView } from '../sync/favorite-public-view.js';

export type AccountExportAccountView = {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly lastLoginAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AccountExportProfileView = {
  readonly id: string;
  readonly name: string;
  readonly avatar: string | null;
  readonly language: string;
  readonly region: string | null;
  readonly isDefault: boolean;
  readonly autoplay: boolean;
  readonly subtitlePrefs: Readonly<Record<string, unknown>>;
  readonly restrictions: ParentalRestrictions;
  readonly pinConfigured: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AccountExportDeviceView = {
  readonly id: string;
  readonly deviceType: string;
  readonly platform: string;
  readonly name: string | null;
  readonly model: string | null;
  readonly appVersion: string | null;
  readonly osVersion: string | null;
  readonly pushTokenConfigured: boolean;
  readonly pairedAt: string;
  readonly lastSeenAt: string | null;
  readonly revokedAt: string | null;
};

export type AccountExportPlaybackView = {
  readonly profileId: string;
  readonly contentId: string;
  readonly sourceId: string | null;
  readonly positionSec: number;
  readonly durationSec: number | null;
  readonly completed: boolean;
  readonly syncVersion: number;
  readonly changeSeq: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AccountDataExport = {
  readonly exportedAt: string;
  readonly account: AccountExportAccountView;
  readonly profiles: readonly AccountExportProfileView[];
  readonly devices: readonly AccountExportDeviceView[];
  readonly sources: readonly ReturnType<typeof toSourcePublicView>[];
  readonly favorites: readonly (ReturnType<typeof toFavoritePublicView> & {
    readonly profileId: string;
  })[];
  readonly playbackStates: readonly AccountExportPlaybackView[];
};

/** Builds a privacy-safe export (NFR-006 / Security §6). Never includes secrets. */
export function toAccountDataExport(input: {
  readonly account: Account;
  readonly profiles: readonly Profile[];
  readonly devices: readonly Device[];
  readonly sources: readonly UserSource[];
  readonly favorites: readonly Favorite[];
  readonly playbackStates: readonly PlaybackState[];
  readonly exportedAt?: Date;
}): AccountDataExport {
  const exportedAt = (input.exportedAt ?? new Date()).toISOString();
  return {
    exportedAt,
    account: {
      id: input.account.id,
      email: input.account.email,
      role: input.account.role,
      status: input.account.status,
      lastLoginAt: input.account.lastLoginAt?.toISOString() ?? null,
      createdAt: input.account.createdAt.toISOString(),
      updatedAt: input.account.updatedAt.toISOString(),
    },
    profiles: input.profiles.map((profile) => ({
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
    })),
    devices: input.devices.map((device) => ({
      id: device.id,
      deviceType: device.deviceType,
      platform: device.platform,
      name: device.name,
      model: device.model,
      appVersion: device.appVersion,
      osVersion: device.osVersion,
      pushTokenConfigured:
        device.pushToken !== null && device.pushToken.length > 0,
      pairedAt: device.pairedAt.toISOString(),
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      revokedAt: device.revokedAt?.toISOString() ?? null,
    })),
    sources: input.sources.map(toSourcePublicView),
    favorites: input.favorites
      .filter((row) => row.deletedAt === null)
      .map((row) => ({
        profileId: row.profileId,
        ...toFavoritePublicView(row),
      })),
    playbackStates: input.playbackStates
      .filter((row) => row.deletedAt === null)
      .map((row) => ({
        profileId: row.profileId,
        contentId: row.contentId,
        sourceId: row.sourceId,
        positionSec: row.positionSec,
        durationSec: row.durationSec,
        completed: row.completed,
        syncVersion: row.syncVersion,
        changeSeq: row.changeSeq,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
  };
}
