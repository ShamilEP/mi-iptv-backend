import { parentPort, workerData } from 'node:worker_threads';
import { XmltvParseError } from '../../domain/catalog/xmltv-parse-error.js';
import { parseXmltvGuideStreaming } from './streaming-xmltv-parser.js';
import type {
  XmltvWorkerRequest,
  XmltvWorkerResponse,
} from './xmltv-parse-worker-protocol.js';

function run(): void {
  if (parentPort === null) {
    throw new Error('xmltv-parse-worker must run as a worker thread');
  }

  const request = workerData as XmltvWorkerRequest;
  let response: XmltvWorkerResponse;
  try {
    const result = parseXmltvGuideStreaming(request.bytes, request.limits);
    response = { ok: true, result };
  } catch (error: unknown) {
    if (error instanceof XmltvParseError) {
      response = { ok: false, code: error.code, message: error.message };
    } else {
      response = {
        ok: false,
        code: 'XMLTV_PARSE_FAILED',
        message:
          error instanceof Error ? error.message : 'XMLTV parse worker failed',
      };
    }
  }

  parentPort.postMessage(response);
}

run();
