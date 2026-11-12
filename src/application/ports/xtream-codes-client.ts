import type {
  XtreamAuthSnapshot,
  XtreamCatalogSnapshot,
  XtreamCategory,
  XtreamLiveStream,
  XtreamSeriesItem,
  XtreamVodStream,
} from '../../domain/catalog/xtream-catalog.js';

/**
 * Credentials for an Xtream Codes panel. Never log password values.
 */
export type XtreamCredentials = {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
};

/**
 * Xtream Codes player_api adapter (BE-045).
 * Implementations must fetch via SSRF-safe HTTP (BE-041).
 */
export interface XtreamCodesClient {
  authenticate(credentials: XtreamCredentials): Promise<XtreamAuthSnapshot>;

  fetchLiveCategories(
    credentials: XtreamCredentials,
  ): Promise<readonly XtreamCategory[]>;

  fetchLiveStreams(
    credentials: XtreamCredentials,
    categoryId?: string,
  ): Promise<readonly XtreamLiveStream[]>;

  fetchVodCategories(
    credentials: XtreamCredentials,
  ): Promise<readonly XtreamCategory[]>;

  fetchVodStreams(
    credentials: XtreamCredentials,
    categoryId?: string,
  ): Promise<readonly XtreamVodStream[]>;

  fetchSeriesCategories(
    credentials: XtreamCredentials,
  ): Promise<readonly XtreamCategory[]>;

  fetchSeries(
    credentials: XtreamCredentials,
    categoryId?: string,
  ): Promise<readonly XtreamSeriesItem[]>;

  /**
   * Authenticate then fetch live / VOD / series categories and listings.
   */
  fetchCatalog(credentials: XtreamCredentials): Promise<XtreamCatalogSnapshot>;
}
