import { createHash } from 'node:crypto';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export const WS_OPCODE_TEXT = 0x1;
export const WS_OPCODE_CLOSE = 0x8;
export const WS_OPCODE_PING = 0x9;
export const WS_OPCODE_PONG = 0xa;

export function computeWebSocketAccept(secWebSocketKey: string): string {
  return createHash('sha1')
    .update(secWebSocketKey + WS_GUID)
    .digest('base64');
}

export function encodeWsFrame(
  opcode: number,
  payload: Buffer,
  mask = false,
): Buffer {
  const length = payload.length;
  const header: number[] = [0x80 | (opcode & 0x0f)];
  if (length < 126) {
    header.push((mask ? 0x80 : 0) | length);
  } else if (length < 65536) {
    header.push((mask ? 0x80 : 0) | 126, (length >> 8) & 0xff, length & 0xff);
  } else {
    const lenBuf = Buffer.alloc(8);
    lenBuf.writeBigUInt64BE(BigInt(length));
    header.push((mask ? 0x80 : 0) | 127, ...lenBuf);
  }

  if (!mask) {
    return Buffer.concat([Buffer.from(header), payload]);
  }
  const maskKey = Buffer.from([
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
  ]);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    masked[i] = payload[i]! ^ maskKey[i % 4]!;
  }
  return Buffer.concat([Buffer.from(header), maskKey, masked]);
}

export type DecodedWsFrame = {
  readonly opcode: number;
  readonly payload: Buffer;
  readonly fin: boolean;
};

/**
 * Parses one complete client→server frame from a buffer.
 * Returns null when more bytes are needed.
 */
export function tryDecodeWsFrame(
  buffer: Buffer,
): { readonly frame: DecodedWsFrame; readonly rest: Buffer } | null {
  if (buffer.length < 2) {
    return null;
  }
  const first = buffer[0]!;
  const second = buffer[1]!;
  const fin = (first & 0x80) !== 0;
  const opcode = first & 0x0f;
  const masked = (second & 0x80) !== 0;
  let offset = 2;
  let payloadLen = second & 0x7f;
  if (payloadLen === 126) {
    if (buffer.length < offset + 2) {
      return null;
    }
    payloadLen = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLen === 127) {
    if (buffer.length < offset + 8) {
      return null;
    }
    const big = buffer.readBigUInt64BE(offset);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('WebSocket payload too large');
    }
    payloadLen = Number(big);
    offset += 8;
  }
  const maskLen = masked ? 4 : 0;
  if (buffer.length < offset + maskLen + payloadLen) {
    return null;
  }
  let payload = buffer.subarray(offset + maskLen, offset + maskLen + payloadLen);
  if (masked) {
    const maskKey = buffer.subarray(offset, offset + 4);
    const unmasked = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i += 1) {
      unmasked[i] = payload[i]! ^ maskKey[i % 4]!;
    }
    payload = unmasked;
  }
  const rest = Buffer.from(
    buffer.subarray(offset + maskLen + payloadLen),
  );
  return { frame: { opcode, payload: Buffer.from(payload), fin }, rest };
}
