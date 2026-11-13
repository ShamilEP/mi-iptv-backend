import { Worker } from 'node:worker_threads';
import type { XmltvParseResult } from '../../domain/catalog/xmltv-guide.js';
import { XmltvParseError } from '../../domain/catalog/xmltv-parse-error.js';
import {
  DEFAULT_XMLTV_PARSER_LIMITS,
  type XmltvParserLimits,
} from '../../application/catalog/xmltv-parser-limits.js';
import type { XmltvGuideParser } from '../../application/ports/xmltv-guide-parser.js';
import type {
  XmltvWorkerRequest,
  XmltvWorkerResponse,
} from './xmltv-parse-worker-protocol.js';

/**
 * Runs the streaming XMLTV parser in a worker thread with time + heap caps
 * (Security §4.2 isolated processing / SEC-032).
 */
export class IsolatedXmltvGuideParser implements XmltvGuideParser {
  constructor(
    private readonly defaultLimits: XmltvParserLimits = DEFAULT_XMLTV_PARSER_LIMITS,
  ) {}

  async parse(
    bytes: Uint8Array,
    partialLimits: Partial<XmltvParserLimits> = {},
  ): Promise<XmltvParseResult> {
    const limits: XmltvParserLimits = {
      ...this.defaultLimits,
      ...partialLimits,
    };

    if (bytes.byteLength > limits.maxBytes) {
      throw new XmltvParseError(
        `XMLTV guide exceeds maxBytes (${limits.maxBytes})`,
        'XMLTV_BYTE_LIMIT',
      );
    }

    const request: XmltvWorkerRequest = {
      bytes: Buffer.from(bytes),
      limits,
    };

    return await runInWorker(request, limits);
  }
}

async function runInWorker(
  request: XmltvWorkerRequest,
  limits: XmltvParserLimits,
): Promise<XmltvParseResult> {
  const workerHref = resolveWorkerHref();

  return await new Promise<XmltvParseResult>((resolve, reject) => {
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
        new XmltvParseError(
          `XMLTV parse exceeded timeout (${limits.timeoutMs}ms)`,
          'XMLTV_TIMEOUT',
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

    const succeed = (result: XmltvParseResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    worker.on('message', (message: XmltvWorkerResponse) => {
      if (message.ok) {
        succeed(message.result);
        return;
      }
      fail(new XmltvParseError(message.message, message.code));
    });

    worker.on('error', (error: Error) => {
      const isOom =
        /heap|memory|allocation|resource.?limit/i.test(error.message) ||
        error.message.includes('ERR_WORKER_OUT_OF_MEMORY');
      fail(
        new XmltvParseError(
          error.message,
          isOom ? 'XMLTV_MEMORY_LIMIT' : 'XMLTV_PARSE_FAILED',
        ),
      );
    });

    worker.on('exit', (code) => {
      if (settled) {
        return;
      }
      if (code === 0) {
        fail(
          new XmltvParseError(
            'XMLTV parse worker exited without a result',
            'XMLTV_PARSE_FAILED',
          ),
        );
        return;
      }
      fail(
        new XmltvParseError(
          `XMLTV parse worker exited with code ${code}`,
          code === 134 || code === 1 ? 'XMLTV_MEMORY_LIMIT' : 'XMLTV_PARSE_FAILED',
        ),
      );
    });
  });
}

function resolveWorkerHref(): URL {
  const self = import.meta.url;
  if (self.endsWith('.ts')) {
    return new URL('./xmltv-parse-worker.ts', self);
  }
  return new URL('./xmltv-parse-worker.js', self);
}
