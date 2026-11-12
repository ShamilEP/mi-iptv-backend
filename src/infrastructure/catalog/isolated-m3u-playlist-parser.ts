import { Worker } from 'node:worker_threads';
import type { M3uParseResult } from '../../domain/catalog/m3u-entry.js';
import { M3uParseError } from '../../domain/catalog/m3u-parse-error.js';
import {
  DEFAULT_M3U_PARSER_LIMITS,
  type M3uParserLimits,
} from '../../application/catalog/m3u-parser-limits.js';
import type { M3uPlaylistParser } from '../../application/ports/m3u-playlist-parser.js';
import type {
  M3uWorkerRequest,
  M3uWorkerResponse,
} from './m3u-parse-worker-protocol.js';

/**
 * Runs the streaming M3U parser in a worker thread with time + heap caps
 * (Security §4.2 isolated processing).
 */
export class IsolatedM3uPlaylistParser implements M3uPlaylistParser {
  constructor(
    private readonly defaultLimits: M3uParserLimits = DEFAULT_M3U_PARSER_LIMITS,
  ) {}

  async parse(
    bytes: Uint8Array,
    partialLimits: Partial<M3uParserLimits> = {},
  ): Promise<M3uParseResult> {
    const limits: M3uParserLimits = {
      ...this.defaultLimits,
      ...partialLimits,
    };

    if (bytes.byteLength > limits.maxBytes) {
      throw new M3uParseError(
        `M3U playlist exceeds maxBytes (${limits.maxBytes})`,
        'M3U_BYTE_LIMIT',
      );
    }

    const request: M3uWorkerRequest = {
      bytes: Buffer.from(bytes),
      limits,
    };

    return await runInWorker(request, limits);
  }
}

async function runInWorker(
  request: M3uWorkerRequest,
  limits: M3uParserLimits,
): Promise<M3uParseResult> {
  const workerHref = resolveWorkerHref();

  return await new Promise<M3uParseResult>((resolve, reject) => {
    let settled = false;
    const worker = new Worker(workerHref, {
      workerData: request,
      resourceLimits: {
        maxOldGenerationSizeMb: limits.maxOldGenerationSizeMb,
        maxYoungGenerationSizeMb: Math.min(32, limits.maxOldGenerationSizeMb),
      },
    });

    const timer = setTimeout(() => {
      fail(
        new M3uParseError(
          `M3U parse exceeded timeout (${limits.timeoutMs}ms)`,
          'M3U_TIMEOUT',
        ),
      );
      void worker.terminate();
    }, limits.timeoutMs);

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const succeed = (result: M3uParseResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    worker.on('message', (message: M3uWorkerResponse) => {
      if (message.ok) {
        succeed(message.result);
        return;
      }
      fail(new M3uParseError(message.message, message.code));
    });

    worker.on('error', (error: Error) => {
      const isOom =
        /heap|memory|allocation|resource.?limit/i.test(error.message) ||
        error.message.includes('ERR_WORKER_OUT_OF_MEMORY');
      fail(
        new M3uParseError(
          error.message,
          isOom ? 'M3U_MEMORY_LIMIT' : 'M3U_PARSE_FAILED',
        ),
      );
    });

    worker.on('exit', (code) => {
      if (settled) {
        return;
      }
      if (code === 0) {
        fail(
          new M3uParseError(
            'M3U parse worker exited without a result',
            'M3U_PARSE_FAILED',
          ),
        );
        return;
      }
      fail(
        new M3uParseError(
          `M3U parse worker exited with code ${code}`,
          code === 134 || code === 1 ? 'M3U_MEMORY_LIMIT' : 'M3U_PARSE_FAILED',
        ),
      );
    });
  });
}

function resolveWorkerHref(): URL {
  // tsx loads .ts workers; production runs compiled .js beside this module.
  const self = import.meta.url;
  if (self.endsWith('.ts')) {
    return new URL('./m3u-parse-worker.ts', self);
  }
  return new URL('./m3u-parse-worker.js', self);
}
