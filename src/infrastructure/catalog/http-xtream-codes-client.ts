import {
  assertXtreamAccountUsable,
  classifyXtreamAccountStatus,
} from '../../domain/catalog/xtream-account-status.js';
import type {
  XtreamAuthSnapshot,
  XtreamCatalogSnapshot,
  XtreamCategory,
  XtreamLiveStream,
  XtreamSeriesItem,
  XtreamVodStream,
} from '../../domain/catalog/xtream-catalog.js';
import { XtreamError } from '../../domain/catalog/xtream-error.js';
import {
  buildXtreamPlayerApiUrl,
  buildXtreamStreamUrl,
} from '../../domain/catalog/xtream-stream-url.js';
import type { FetchSourceUrlSafely } from '../../application/sources/fetch-source-url-safely.js';
import type {
  XtreamCodesClient,
  XtreamCredentials,
} from '../../application/ports/xtream-codes-client.js';
import { SsrfGuardError } from '../../domain/sources/ssrf-guard-error.js';

/**
 * Xtream Codes player_api client over SSRF-safe HTTP (BE-041 + BE-045).
 */
export class HttpXtreamCodesClient implements XtreamCodesClient {
  constructor(private readonly safeFetch: FetchSourceUrlSafely) {}

  async authenticate(
    credentials: XtreamCredentials,
  ): Promise<XtreamAuthSnapshot> {
    const payload = await this.getJson(credentials);
    return this.parseAuth(payload);
  }

  async fetchLiveCategories(
    credentials: XtreamCredentials,
  ): Promise<readonly XtreamCategory[]> {
    const payload = await this.getJson(credentials, 'get_live_categories');
    return parseCategories(payload);
  }

  async fetchLiveStreams(
    credentials: XtreamCredentials,
    categoryId?: string,
  ): Promise<readonly XtreamLiveStream[]> {
    const payload = await this.getJson(
      credentials,
      'get_live_streams',
      categoryId !== undefined ? { category_id: categoryId } : undefined,
    );
    return parseLiveStreams(payload, credentials);
  }

  async fetchVodCategories(
    credentials: XtreamCredentials,
  ): Promise<readonly XtreamCategory[]> {
    const payload = await this.getJson(credentials, 'get_vod_categories');
    return parseCategories(payload);
  }

  async fetchVodStreams(
    credentials: XtreamCredentials,
    categoryId?: string,
  ): Promise<readonly XtreamVodStream[]> {
    const payload = await this.getJson(
      credentials,
      'get_vod_streams',
      categoryId !== undefined ? { category_id: categoryId } : undefined,
    );
    return parseVodStreams(payload, credentials);
  }

  async fetchSeriesCategories(
    credentials: XtreamCredentials,
  ): Promise<readonly XtreamCategory[]> {
    const payload = await this.getJson(credentials, 'get_series_categories');
    return parseCategories(payload);
  }

  async fetchSeries(
    credentials: XtreamCredentials,
    categoryId?: string,
  ): Promise<readonly XtreamSeriesItem[]> {
    const payload = await this.getJson(
      credentials,
      'get_series',
      categoryId !== undefined ? { category_id: categoryId } : undefined,
    );
    return parseSeries(payload);
  }

  async fetchCatalog(
    credentials: XtreamCredentials,
  ): Promise<XtreamCatalogSnapshot> {
    const auth = await this.authenticate(credentials);
    const [
      liveCategories,
      liveStreams,
      vodCategories,
      vodStreams,
      seriesCategories,
      series,
    ] = await Promise.all([
      this.fetchLiveCategories(credentials),
      this.fetchLiveStreams(credentials),
      this.fetchVodCategories(credentials),
      this.fetchVodStreams(credentials),
      this.fetchSeriesCategories(credentials),
      this.fetchSeries(credentials),
    ]);

    return {
      auth,
      liveCategories,
      liveStreams,
      vodCategories,
      vodStreams,
      seriesCategories,
      series,
    };
  }

  private async getJson(
    credentials: XtreamCredentials,
    action?: string,
    extraParams?: Readonly<Record<string, string>>,
  ): Promise<unknown> {
    const url = buildXtreamPlayerApiUrl({
      baseUrl: credentials.baseUrl,
      username: credentials.username,
      password: credentials.password,
      ...(action !== undefined ? { action } : {}),
      ...(extraParams !== undefined ? { extraParams } : {}),
    });

    let response;
    try {
      response = await this.safeFetch.execute(url);
    } catch (error: unknown) {
      if (error instanceof SsrfGuardError || error instanceof XtreamError) {
        throw error;
      }
      throw new XtreamError(
        error instanceof Error
          ? `Xtream HTTP request failed: ${error.message}`
          : 'Xtream HTTP request failed',
        'XTREAM_HTTP_FAILED',
      );
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new XtreamError(
        `Xtream HTTP status ${response.statusCode}`,
        'XTREAM_HTTP_FAILED',
      );
    }

    try {
      const text = new TextDecoder('utf-8').decode(response.body);
      return JSON.parse(text) as unknown;
    } catch {
      throw new XtreamError(
        'Xtream response was not valid JSON',
        'XTREAM_INVALID_RESPONSE',
      );
    }
  }

  private parseAuth(payload: unknown): XtreamAuthSnapshot {
    if (!isRecord(payload)) {
      throw new XtreamError(
        'Xtream auth response was invalid',
        'XTREAM_INVALID_RESPONSE',
      );
    }
    const userInfoRaw = payload['user_info'];
    if (!isRecord(userInfoRaw)) {
      throw new XtreamError(
        'Xtream auth response missing user_info',
        'XTREAM_INVALID_RESPONSE',
      );
    }

    const userInfo = {
      auth: userInfoRaw['auth'] as string | number | boolean | null | undefined,
      status: asNullableString(userInfoRaw['status']),
      expDate: userInfoRaw['exp_date'] as string | number | null | undefined,
    };

    assertXtreamAccountUsable(userInfo);

    const formatsRaw = userInfoRaw['allowed_output_formats'];
    const allowedOutputFormats = Array.isArray(formatsRaw)
      ? formatsRaw.filter((item): item is string => typeof item === 'string')
      : [];

    return {
      status: classifyXtreamAccountStatus(userInfo),
      username: asNullableString(userInfoRaw['username']),
      expDate:
        userInfo.expDate === null || userInfo.expDate === undefined
          ? null
          : String(userInfo.expDate),
      maxConnections: asNullableString(userInfoRaw['max_connections']),
      allowedOutputFormats,
    };
  }
}

function parseCategories(payload: unknown): readonly XtreamCategory[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  const categories: XtreamCategory[] = [];
  for (const item of payload) {
    if (!isRecord(item)) {
      continue;
    }
    const categoryId = asNullableString(item['category_id']);
    const categoryName = asNullableString(item['category_name']);
    if (categoryId === null || categoryName === null) {
      continue;
    }
    categories.push({ categoryId, categoryName });
  }
  return categories;
}

function parseLiveStreams(
  payload: unknown,
  credentials: XtreamCredentials,
): readonly XtreamLiveStream[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  const streams: XtreamLiveStream[] = [];
  for (const item of payload) {
    if (!isRecord(item)) {
      continue;
    }
    const streamId = asNullableString(item['stream_id']);
    const name = asNullableString(item['name']);
    if (streamId === null || name === null) {
      continue;
    }
    streams.push({
      streamId,
      name,
      categoryId: asNullableString(item['category_id']),
      streamIcon: asNullableString(item['stream_icon']),
      epgChannelId: asNullableString(item['epg_channel_id']),
      streamUrl: buildXtreamStreamUrl({
        baseUrl: credentials.baseUrl,
        username: credentials.username,
        password: credentials.password,
        kind: 'live',
        streamId,
        extension: 'ts',
      }),
    });
  }
  return streams;
}

function parseVodStreams(
  payload: unknown,
  credentials: XtreamCredentials,
): readonly XtreamVodStream[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  const streams: XtreamVodStream[] = [];
  for (const item of payload) {
    if (!isRecord(item)) {
      continue;
    }
    const streamId = asNullableString(item['stream_id']);
    const name = asNullableString(item['name']);
    if (streamId === null || name === null) {
      continue;
    }
    const containerExtension = asNullableString(item['container_extension']);
    streams.push({
      streamId,
      name,
      categoryId: asNullableString(item['category_id']),
      streamIcon: asNullableString(item['stream_icon']),
      containerExtension,
      streamUrl: buildXtreamStreamUrl({
        baseUrl: credentials.baseUrl,
        username: credentials.username,
        password: credentials.password,
        kind: 'movie',
        streamId,
        extension: containerExtension,
      }),
    });
  }
  return streams;
}

function parseSeries(payload: unknown): readonly XtreamSeriesItem[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  const series: XtreamSeriesItem[] = [];
  for (const item of payload) {
    if (!isRecord(item)) {
      continue;
    }
    const seriesId = asNullableString(item['series_id']);
    const name = asNullableString(item['name']);
    if (seriesId === null || name === null) {
      continue;
    }
    series.push({
      seriesId,
      name,
      categoryId: asNullableString(item['category_id']),
      cover: asNullableString(item['cover']),
    });
  }
  return series;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNullableString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}
