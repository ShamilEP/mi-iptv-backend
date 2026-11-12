import type { XtreamAccountStatus } from './xtream-account-status.js';

export type XtreamCategory = {
  readonly categoryId: string;
  readonly categoryName: string;
};

export type XtreamLiveStream = {
  readonly streamId: string;
  readonly name: string;
  readonly categoryId: string | null;
  readonly streamIcon: string | null;
  readonly epgChannelId: string | null;
  readonly streamUrl: string;
};

export type XtreamVodStream = {
  readonly streamId: string;
  readonly name: string;
  readonly categoryId: string | null;
  readonly streamIcon: string | null;
  readonly containerExtension: string | null;
  readonly streamUrl: string;
};

export type XtreamSeriesItem = {
  readonly seriesId: string;
  readonly name: string;
  readonly categoryId: string | null;
  readonly cover: string | null;
};

export type XtreamAuthSnapshot = {
  readonly status: XtreamAccountStatus;
  readonly username: string | null;
  readonly expDate: string | null;
  readonly maxConnections: string | null;
  readonly allowedOutputFormats: readonly string[];
};

export type XtreamCatalogSnapshot = {
  readonly auth: XtreamAuthSnapshot;
  readonly liveCategories: readonly XtreamCategory[];
  readonly liveStreams: readonly XtreamLiveStream[];
  readonly vodCategories: readonly XtreamCategory[];
  readonly vodStreams: readonly XtreamVodStream[];
  readonly seriesCategories: readonly XtreamCategory[];
  readonly series: readonly XtreamSeriesItem[];
};
