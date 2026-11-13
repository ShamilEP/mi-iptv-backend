import type {
  XmltvChannel,
  XmltvParseResult,
  XmltvProgramme,
} from '../../domain/catalog/xmltv-guide.js';
import { XmltvParseError } from '../../domain/catalog/xmltv-parse-error.js';
import {
  DEFAULT_XMLTV_PARSER_LIMITS,
  type XmltvParserLimits,
} from '../../application/catalog/xmltv-parser-limits.js';

const CHANNEL_OPEN = /<channel\b([^>]*)>/i;
const CHANNEL_ID = /\bid\s*=\s*"([^"]+)"/i;
const DISPLAY_NAME = /<display-name\b[^>]*>([^<]*)<\/display-name>/i;
const PROGRAMME_OPEN = /<programme\b([^>]*)>/i;
const ATTR = /\b(channel|start|stop)\s*=\s*"([^"]*)"/gi;
const TITLE = /<title\b[^>]*>([^<]*)<\/title>/i;
const FORBIDDEN = /<!DOCTYPE\b|<!ENTITY\b/i;

/**
 * Streaming-friendly XMLTV scan: O(line) working set, no DOM, no entity expansion.
 * Rejects DTD/ENTITY to reduce XXE-style expansion risk (SEC-032).
 */
export function parseXmltvGuideStreaming(
  bytes: Uint8Array,
  partialLimits: Partial<XmltvParserLimits> = {},
): XmltvParseResult {
  const limits: XmltvParserLimits = {
    ...DEFAULT_XMLTV_PARSER_LIMITS,
    ...partialLimits,
  };

  if (!(bytes instanceof Uint8Array)) {
    throw new XmltvParseError(
      'XMLTV input must be a byte array',
      'XMLTV_INVALID_INPUT',
    );
  }
  if (bytes.byteLength > limits.maxBytes) {
    throw new XmltvParseError(
      `XMLTV guide exceeds maxBytes (${limits.maxBytes})`,
      'XMLTV_BYTE_LIMIT',
    );
  }

  const text = Buffer.from(bytes).toString('utf8');
  if (FORBIDDEN.test(text)) {
    throw new XmltvParseError(
      'XMLTV DTD / ENTITY declarations are not allowed',
      'XMLTV_FORBIDDEN_DTD',
    );
  }

  const channels: XmltvChannel[] = [];
  const programmes: XmltvProgramme[] = [];
  let skippedTagCount = 0;
  let pendingChannelAttrs: string | null = null;
  let pendingProgrammeAttrs: string | null = null;
  let pendingChannelBody = '';
  let pendingProgrammeBody = '';

  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.length > limits.maxLineLength) {
      throw new XmltvParseError(
        `XMLTV line exceeds maxLineLength (${limits.maxLineLength})`,
        'XMLTV_LINE_LIMIT',
      );
    }
    const line = rawLine;

    if (pendingChannelAttrs !== null) {
      pendingChannelBody += `\n${line}`;
      if (/<\/channel>/i.test(line)) {
        pushChannel(pendingChannelAttrs, pendingChannelBody);
        pendingChannelAttrs = null;
        pendingChannelBody = '';
      }
      continue;
    }

    if (pendingProgrammeAttrs !== null) {
      pendingProgrammeBody += `\n${line}`;
      if (/<\/programme>/i.test(line)) {
        pushProgramme(pendingProgrammeAttrs, pendingProgrammeBody);
        pendingProgrammeAttrs = null;
        pendingProgrammeBody = '';
      }
      continue;
    }

    const channelMatch = CHANNEL_OPEN.exec(line);
    if (channelMatch) {
      const attrs = channelMatch[1] ?? '';
      if (/\/\s*>/.test(line) || /<\/channel>/i.test(line)) {
        pushChannel(attrs, line);
      } else {
        pendingChannelAttrs = attrs;
        pendingChannelBody = line;
      }
      continue;
    }

    const programmeMatch = PROGRAMME_OPEN.exec(line);
    if (programmeMatch) {
      const attrs = programmeMatch[1] ?? '';
      if (/\/\s*>/.test(line) || /<\/programme>/i.test(line)) {
        pushProgramme(attrs, line);
      } else {
        pendingProgrammeAttrs = attrs;
        pendingProgrammeBody = line;
      }
      continue;
    }
  }

  return {
    channels,
    programmes,
    stats: {
      channelCount: channels.length,
      programmeCount: programmes.length,
      skippedTagCount,
      byteLength: bytes.byteLength,
    },
  };

  function pushChannel(attrs: string, body: string): void {
    const idMatch = CHANNEL_ID.exec(attrs);
    if (idMatch === null || idMatch[1] === undefined || idMatch[1] === '') {
      skippedTagCount += 1;
      return;
    }
    if (channels.length >= limits.maxChannels) {
      throw new XmltvParseError(
        `XMLTV guide exceeds maxChannels (${limits.maxChannels})`,
        'XMLTV_CHANNEL_LIMIT',
      );
    }
    const nameMatch = DISPLAY_NAME.exec(body);
    channels.push({
      id: idMatch[1],
      displayName: nameMatch?.[1]?.trim() || null,
    });
  }

  function pushProgramme(attrs: string, body: string): void {
    let channelId = '';
    let start = '';
    let stop: string | null = null;
    ATTR.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ATTR.exec(attrs)) !== null) {
      const key = match[1]?.toLowerCase();
      const value = match[2] ?? '';
      if (key === 'channel') {
        channelId = value;
      } else if (key === 'start') {
        start = value;
      } else if (key === 'stop') {
        stop = value === '' ? null : value;
      }
    }
    if (channelId === '' || start === '') {
      skippedTagCount += 1;
      return;
    }
    if (programmes.length >= limits.maxProgrammes) {
      throw new XmltvParseError(
        `XMLTV guide exceeds maxProgrammes (${limits.maxProgrammes})`,
        'XMLTV_PROGRAMME_LIMIT',
      );
    }
    const titleMatch = TITLE.exec(body);
    programmes.push({
      channelId,
      start,
      stop,
      title: titleMatch?.[1]?.trim() || null,
    });
  }
}
