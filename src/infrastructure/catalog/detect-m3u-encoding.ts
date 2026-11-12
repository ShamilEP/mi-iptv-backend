export type DetectedM3uEncoding = {
  readonly encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'latin1';
  readonly bomLength: number;
};

/**
 * Detect BOM / fall back for untrusted playlist bytes.
 * Prefer UTF-8; use UTF-16 when BOM present; otherwise latin1-safe decode path
 * is selected only when UTF-8 would be empty nonsense — caller still streams UTF-8 first.
 */
export function detectM3uEncoding(bytes: Uint8Array): DetectedM3uEncoding {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return { encoding: 'utf-8', bomLength: 3 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', bomLength: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'utf-16be', bomLength: 2 };
  }
  return { encoding: 'utf-8', bomLength: 0 };
}

export function decodeM3uBytes(bytes: Uint8Array): {
  readonly text: string;
  readonly encoding: string;
} {
  const detected = detectM3uEncoding(bytes);
  const payload = bytes.subarray(detected.bomLength);

  if (detected.encoding === 'utf-16be') {
    const swapped = swapUtf16Endianness(payload);
    return {
      text: new TextDecoder('utf-16le').decode(swapped),
      encoding: 'utf-16be',
    };
  }

  if (detected.encoding === 'utf-16le') {
    return {
      text: new TextDecoder('utf-16le').decode(payload),
      encoding: 'utf-16le',
    };
  }

  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(payload);
  if (shouldFallbackToLatin1(payload, utf8)) {
    return {
      text: new TextDecoder('latin1').decode(payload),
      encoding: 'latin1',
    };
  }

  return { text: utf8, encoding: 'utf-8' };
}

function swapUtf16Endianness(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length - (bytes.length % 2));
  for (let i = 0; i + 1 < out.length; i += 2) {
    out[i] = bytes[i + 1]!;
    out[i + 1] = bytes[i]!;
  }
  return out;
}

/**
 * Heuristic: many NULs or replacement chars after UTF-8 decode → try latin1.
 */
function shouldFallbackToLatin1(payload: Uint8Array, utf8: string): boolean {
  if (payload.length === 0) {
    return false;
  }
  let nulCount = 0;
  for (let i = 0; i < Math.min(payload.length, 4096); i += 1) {
    if (payload[i] === 0) {
      nulCount += 1;
    }
  }
  if (nulCount > 8) {
    return false;
  }
  const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length;
  return (
    replacementCount > 0 && replacementCount / Math.max(utf8.length, 1) > 0.02
  );
}
