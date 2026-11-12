import { parentPort, workerData } from 'node:worker_threads';
import { M3uParseError } from '../../domain/catalog/m3u-parse-error.js';
import { parseM3uPlaylistStreaming } from './streaming-m3u-parser.js';
import type {
  M3uWorkerRequest,
  M3uWorkerResponse,
} from './m3u-parse-worker-protocol.js';

function run(): void {
  if (parentPort === null) {
    throw new Error('m3u-parse-worker must run as a worker thread');
  }

  const request = workerData as M3uWorkerRequest;
  let response: M3uWorkerResponse;
  try {
    const result = parseM3uPlaylistStreaming(request.bytes, request.limits);
    response = { ok: true, result };
  } catch (error: unknown) {
    if (error instanceof M3uParseError) {
      response = { ok: false, code: error.code, message: error.message };
    } else {
      response = {
        ok: false,
        code: 'M3U_PARSE_FAILED',
        message:
          error instanceof Error ? error.message : 'M3U parse worker failed',
      };
    }
  }

  parentPort.postMessage(response);
}

run();
