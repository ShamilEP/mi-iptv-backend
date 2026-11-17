import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { URL } from 'node:url';
import type { FlushPendingDeviceCommands } from '../../application/devices/flush-pending-device-commands.js';
import type { AuthenticateRealtimeHandshake } from '../../application/realtime/authenticate-realtime-handshake.js';
import { RealtimeConnectionRegistry } from '../../application/realtime/realtime-connection-registry.js';
import type { DeviceSocketPresence } from '../../application/ports/device-socket-presence.js';
import type { Logger } from '../../application/ports/logger.js';
import type { RealtimeDeviceBus } from '../../application/ports/realtime-device-bus.js';
import type { RealtimeSessionStore } from '../../application/ports/realtime-session-store.js';
import type { RealtimeGatewayConfig } from '../../config/realtime.js';
import { toServerTimestamp } from '../../domain/api/server-clock.js';
import {
  deviceChannel,
  type RealtimeHelloMessage,
} from '../../domain/realtime/realtime-protocol.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import {
  computeWebSocketAccept,
  encodeWsFrame,
  tryDecodeWsFrame,
  WS_OPCODE_CLOSE,
  WS_OPCODE_PING,
  WS_OPCODE_PONG,
  WS_OPCODE_TEXT,
} from '../../infrastructure/realtime/node-websocket-frames.js';

/**
 * Authenticated WSS upgrade at `/realtime` (BE-077 / ADR-007).
 * Uses Node built-in HTTP upgrade + RFC6455 framing (no third-party `ws` package).
 */
export class NodeRealtimeGateway {
  private readonly registry: RealtimeConnectionRegistry;

  constructor(
    private readonly deps: {
      readonly authenticate: AuthenticateRealtimeHandshake;
      readonly presence: DeviceSocketPresence;
      readonly bus: RealtimeDeviceBus;
      readonly sessions: RealtimeSessionStore;
      readonly config: RealtimeGatewayConfig;
      /** Optional: flush queued send-to-TV commands after handshake (BE-080). */
      readonly flushPendingCommands?: FlushPendingDeviceCommands;
      readonly logger?: Logger;
    },
  ) {
    this.registry = new RealtimeConnectionRegistry(
      deps.config.maxConnectionsPerDevice,
      deps.config.maxConnectionsPerAccount,
    );
  }

  handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    _head: Buffer,
  ): void {
    void this.upgrade(req, socket);
  }

  private async upgrade(req: IncomingMessage, socket: Duplex): Promise<void> {
    const host = req.headers.host ?? 'localhost';
    const url = new URL(req.url ?? '/', `http://${host}`);
    if (url.pathname !== '/realtime') {
      this.writeHttpError(socket, 404, 'NOT_FOUND', 'Not Found');
      return;
    }

    const deviceId =
      url.searchParams.get('deviceId')?.trim() ||
      readHeader(req, 'x-device-id') ||
      '';
    const accessToken =
      readBearer(req) || url.searchParams.get('access_token')?.trim() || '';
    const resumeToken = url.searchParams.get('resumeToken')?.trim() || '';

    try {
      const claims = await this.deps.authenticate.execute({
        accessToken,
        deviceId,
      });

      let sessionId = String(randomUUID());
      let issuedResume = String(randomUUID());
      if (resumeToken !== '') {
        const prior = await this.deps.sessions.findByResumeToken(resumeToken);
        if (
          prior !== null &&
          prior.accountId === claims.accountId &&
          prior.deviceId === claims.deviceId
        ) {
          sessionId = String(prior.sessionId);
          issuedResume = String(prior.resumeToken);
        }
      }

      this.registry.assertCanAccept(claims.accountId, claims.deviceId);

      const key = req.headers['sec-websocket-key'];
      const secKey = Array.isArray(key) ? key[0] : key;
      if (typeof secKey !== 'string' || secKey.trim() === '') {
        this.writeHttpError(
          socket,
          400,
          'REALTIME_UPGRADE_INVALID',
          'Sec-WebSocket-Key required',
        );
        return;
      }

      const accept = computeWebSocketAccept(secKey.trim());
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n` +
          '\r\n',
      );

      const connectionId = randomUUID();
      this.registry.register({
        connectionId,
        accountId: claims.accountId,
        deviceId: claims.deviceId,
        sessionId,
      });

      await this.deps.sessions.save(
        {
          sessionId,
          resumeToken: issuedResume,
          accountId: claims.accountId,
          deviceId: claims.deviceId,
          createdAtUnix: Math.floor(Date.now() / 1000),
        },
        this.deps.config.resumeTtlSeconds,
      );

      await this.deps.presence.markConnected(
        claims.accountId,
        claims.deviceId,
        this.deps.config.nodeId,
      );

      const unsubscribe = await this.deps.bus.subscribe(
        claims.deviceId,
        (message) => {
          this.sendText(socket, message);
        },
      );

      const hello: RealtimeHelloMessage = {
        type: 'hello',
        sessionId,
        resumeToken: issuedResume,
        deviceChannel: deviceChannel(claims.deviceId),
        serverTimestamp: toServerTimestamp(new Date()),
      };
      this.sendText(socket, JSON.stringify(hello));

      if (this.deps.flushPendingCommands) {
        void this.deps.flushPendingCommands
          .execute(claims.accountId, claims.deviceId)
          .catch((error: unknown) => {
            this.deps.logger?.warn('Realtime pending command flush failed', {
              trace_id: null,
              account_id: claims.accountId,
              errorName: error instanceof Error ? error.name : 'UnknownError',
            });
          });
      }

      let buffer: Buffer = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        try {
          while (true) {
            const decoded = tryDecodeWsFrame(buffer);
            if (decoded === null) {
              break;
            }
            buffer = Buffer.from(decoded.rest);
            void this.onFrame(
              socket,
              decoded.frame.opcode,
              decoded.frame.payload,
              claims.accountId,
              claims.deviceId,
            );
          }
        } catch (error: unknown) {
          this.deps.logger?.warn('Realtime frame parse failed', {
            trace_id: null,
            account_id: claims.accountId,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          });
          socket.destroy();
        }
      });

      const cleanup = () => {
        unsubscribe();
        const removed = this.registry.unregister(connectionId);
        if (removed) {
          void this.deps.presence.markDisconnected(
            removed.accountId,
            removed.deviceId,
          );
        }
      };
      socket.on('close', cleanup);
      socket.on('error', cleanup);
    } catch (error: unknown) {
      if (error instanceof DomainError) {
        const status =
          error.code === 'REALTIME_DEVICE_CONNECTION_LIMIT' ||
          error.code === 'REALTIME_ACCOUNT_CONNECTION_LIMIT'
            ? 429
            : error.code === 'REALTIME_DEVICE_MISMATCH'
              ? 403
              : 401;
        this.writeHttpError(socket, status, error.code, error.message);
        return;
      }
      this.writeHttpError(socket, 500, 'INTERNAL', 'Internal Server Error');
    }
  }

  private async onFrame(
    socket: Duplex,
    opcode: number,
    payload: Buffer,
    accountId: string,
    deviceId: string,
  ): Promise<void> {
    if (opcode === WS_OPCODE_CLOSE) {
      socket.end();
      return;
    }
    if (opcode === WS_OPCODE_PING) {
      socket.write(encodeWsFrame(WS_OPCODE_PONG, payload));
      await this.deps.presence.touch(accountId, deviceId);
      return;
    }
    if (opcode === WS_OPCODE_PONG) {
      await this.deps.presence.touch(accountId, deviceId);
      return;
    }
    if (opcode !== WS_OPCODE_TEXT) {
      return;
    }
    let message: { type?: string; channel?: string; payload?: unknown };
    try {
      message = JSON.parse(payload.toString('utf8')) as {
        type?: string;
        channel?: string;
        payload?: unknown;
      };
    } catch {
      return;
    }
    if (message.type === 'heartbeat' || message.type === 'ping') {
      await this.deps.presence.touch(accountId, deviceId);
      if (message.type === 'ping') {
        this.sendText(socket, JSON.stringify({ type: 'pong' }));
      }
      return;
    }
    if (message.type === 'event' && typeof message.channel === 'string') {
      const expected = deviceChannel(deviceId);
      if (message.channel !== expected) {
        return;
      }
      const body = JSON.stringify({
        type: 'event',
        channel: expected,
        payload:
          message.payload !== null &&
          typeof message.payload === 'object' &&
          !Array.isArray(message.payload)
            ? message.payload
            : {},
      });
      await this.deps.bus.publish(deviceId, body);
    }
  }

  private sendText(socket: Duplex, text: string): void {
    if (socket.destroyed) {
      return;
    }
    socket.write(encodeWsFrame(WS_OPCODE_TEXT, Buffer.from(text, 'utf8')));
  }

  private writeHttpError(
    socket: Duplex,
    status: number,
    code: string,
    error: string,
  ): void {
    const body = JSON.stringify({ error, code });
    socket.write(
      `HTTP/1.1 ${status} Error\r\n` +
        'Content-Type: application/json; charset=utf-8\r\n' +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        'Connection: close\r\n' +
        '\r\n' +
        body,
    );
    socket.destroy();
  }
}

function readHeader(req: IncomingMessage, name: string): string | null {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  return value.trim();
}

function readBearer(req: IncomingMessage): string | null {
  const value = readHeader(req, 'authorization');
  if (value === null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(value);
  const token = match?.[1]?.trim();
  return token !== undefined && token.length > 0 ? token : null;
}
