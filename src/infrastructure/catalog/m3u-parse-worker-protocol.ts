import type { M3uParseResult } from '../../domain/catalog/m3u-entry.js';
import type { M3uParserLimits } from '../../application/catalog/m3u-parser-limits.js';
import type { M3uParseErrorCode } from '../../domain/catalog/m3u-parse-error.js';

export type M3uWorkerRequest = {
  readonly bytes: Uint8Array;
  readonly limits: M3uParserLimits;
};

export type M3uWorkerSuccess = {
  readonly ok: true;
  readonly result: M3uParseResult;
};

export type M3uWorkerFailure = {
  readonly ok: false;
  readonly code: M3uParseErrorCode | 'M3U_PARSE_FAILED';
  readonly message: string;
};

export type M3uWorkerResponse = M3uWorkerSuccess | M3uWorkerFailure;
