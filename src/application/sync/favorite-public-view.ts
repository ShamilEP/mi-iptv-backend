import type { Favorite } from '../../domain/sync/favorite.js';

export type FavoritePublicView = {
  readonly itemId: string;
  readonly type: 'channel' | 'vod';
  readonly sortOrder: number;
  readonly syncVersion: number;
  readonly changeSeq: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export function toFavoritePublicView(favorite: Favorite): FavoritePublicView {
  return {
    itemId: favorite.itemId,
    type: favorite.type,
    sortOrder: favorite.sortOrder,
    syncVersion: favorite.syncVersion,
    changeSeq: favorite.changeSeq,
    createdAt: favorite.createdAt.toISOString(),
    updatedAt: favorite.updatedAt.toISOString(),
  };
}
