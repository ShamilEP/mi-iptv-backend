/**
 * One playable row extracted from an M3U / M3U8 playlist (BE-044).
 * Maps toward the canonical catalog model (Backend §4) at ingest time.
 */
export type M3uEntry = {
  readonly title: string;
  readonly tvgId: string | null;
  readonly tvgName: string | null;
  readonly tvgLogo: string | null;
  readonly groupTitle: string | null;
  readonly streamUri: string;
  readonly durationSec: number | null;
  readonly lineNumber: number;
};

export type M3uParseStats = {
  readonly entryCount: number;
  readonly skippedLineCount: number;
  readonly bytesRead: number;
  readonly encoding: string;
};

export type M3uParseResult = {
  readonly entries: readonly M3uEntry[];
  readonly stats: M3uParseStats;
};
