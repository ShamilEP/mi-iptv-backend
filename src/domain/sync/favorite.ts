/**
 * Per-profile favorite row (Backend `app.favorites` / BE-063).
 */

export type FavoriteType = 'channel' | 'vod';

export type Favorite = {
  readonly profileId: string;
  readonly accountId: string;
  readonly itemId: string;
  readonly type: FavoriteType;
  readonly sortOrder: number;
  readonly syncVersion: number;
  readonly changeSeq: number;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export function isFavoriteType(value: string): value is FavoriteType {
  return value === 'channel' || value === 'vod';
}

export function isFavoriteAction(
  value: string,
): value is 'add' | 'remove' {
  return value === 'add' || value === 'remove';
}
