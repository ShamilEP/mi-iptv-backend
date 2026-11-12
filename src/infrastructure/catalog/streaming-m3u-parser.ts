import type {
  M3uEntry,
  M3uParseResult,
} from '../../domain/catalog/m3u-entry.js';
import { M3uParseError } from '../../domain/catalog/m3u-parse-error.js';
import { parseExtInfLine } from '../../domain/catalog/parse-extinf.js';
import {
  DEFAULT_M3U_PARSER_LIMITS,
  type M3uParserLimits,
} from '../../application/catalog/m3u-parser-limits.js';
import { decodeM3uBytes } from './detect-m3u-encoding.js';

type PendingExtInf = {
  readonly attrs: NonNullable<ReturnType<typeof parseExtInfLine>>;
  readonly lineNumber: number;
};

/**
 * Line-oriented M3U parser: O(line) working set, hard caps for untrusted lists.
 */
export function parseM3uPlaylistStreaming(
  bytes: Uint8Array,
  partialLimits: Partial<M3uParserLimits> = {},
): M3uParseResult {
  const limits: M3uParserLimits = {
    ...DEFAULT_M3U_PARSER_LIMITS,
    ...partialLimits,
  };

  if (bytes.byteLength > limits.maxBytes) {
    throw new M3uParseError(
      `M3U playlist exceeds maxBytes (${limits.maxBytes})`,
      'M3U_BYTE_LIMIT',
    );
  }

  const { text, encoding } = decodeM3uBytes(bytes);
  const entries: M3uEntry[] = [];
  let skippedLineCount = 0;
  let pending: PendingExtInf | null = null;
  let lineNumber = 0;

  // Stream by scanning newlines without materializing a full split array of huge lists.
  let offset = 0;
  while (offset <= text.length) {
    const nextNl = text.indexOf('\n', offset);
    const end = nextNl === -1 ? text.length : nextNl;
    let line = text.slice(offset, end);
    if (line.endsWith('\r')) {
      line = line.slice(0, -1);
    }
    offset = nextNl === -1 ? text.length + 1 : nextNl + 1;
    if (nextNl === -1 && line.length === 0) {
      break;
    }

    lineNumber += 1;
    if (line.length > limits.maxLineLength) {
      throw new M3uParseError(
        `M3U line ${lineNumber} exceeds maxLineLength (${limits.maxLineLength})`,
        'M3U_LINE_LIMIT',
      );
    }

    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    if (trimmed.startsWith('#')) {
      const upper = trimmed.toUpperCase();
      if (upper.startsWith('#EXTINF:')) {
        if (pending !== null) {
          skippedLineCount += 1;
          pending = null;
        }
        const attrs = parseExtInfLine(trimmed);
        if (attrs === null) {
          skippedLineCount += 1;
          continue;
        }
        pending = { attrs, lineNumber };
        continue;
      }
      // Other tags (#EXTM3U, #EXTGRP, comments) — ignore.
      continue;
    }

    if (pending === null) {
      skippedLineCount += 1;
      continue;
    }

    if (!isPlausibleStreamUri(trimmed)) {
      skippedLineCount += 1;
      pending = null;
      continue;
    }

    if (entries.length >= limits.maxEntries) {
      throw new M3uParseError(
        `M3U playlist exceeds maxEntries (${limits.maxEntries})`,
        'M3U_ENTRY_LIMIT',
      );
    }

    entries.push({
      title: pending.attrs.title,
      tvgId: emptyToNull(pending.attrs.tvgId),
      tvgName: emptyToNull(pending.attrs.tvgName),
      tvgLogo: emptyToNull(pending.attrs.tvgLogo),
      groupTitle: emptyToNull(pending.attrs.groupTitle),
      streamUri: trimmed,
      durationSec: pending.attrs.durationSec,
      lineNumber: pending.lineNumber,
    });
    pending = null;
  }

  if (pending !== null) {
    skippedLineCount += 1;
  }

  return {
    entries,
    stats: {
      entryCount: entries.length,
      skippedLineCount,
      bytesRead: bytes.byteLength,
      encoding,
    },
  };
}

function emptyToNull(value: string | null): string | null {
  if (value === null || value.trim() === '') {
    return null;
  }
  return value;
}

function isPlausibleStreamUri(value: string): boolean {
  if (value.includes('\0')) {
    return false;
  }
  const lower = value.toLowerCase();
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('rtmp://') ||
    lower.startsWith('rtsp://') ||
    lower.startsWith('udp://') ||
    lower.startsWith('rtp://')
  ) {
    return true;
  }
  // Relative paths sometimes appear in playlists — keep but do not allow schemes like file:
  if (lower.includes('://')) {
    return false;
  }
  return value.length > 0;
}
