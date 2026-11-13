import type { XmltvParseResult } from '../../domain/catalog/xmltv-guide.js';
import type { XmltvParserLimits } from '../../application/catalog/xmltv-parser-limits.js';
import type { XmltvParseErrorCode } from '../../domain/catalog/xmltv-parse-error.js';

export type XmltvWorkerRequest = {
  readonly bytes: Uint8Array;
  readonly limits: XmltvParserLimits;
};

export type XmltvWorkerSuccess = {
  readonly ok: true;
  readonly result: XmltvParseResult;
};

export type XmltvWorkerFailure = {
  readonly ok: false;
  readonly code: XmltvParseErrorCode | 'XMLTV_PARSE_FAILED';
  readonly message: string;
};

export type XmltvWorkerResponse = XmltvWorkerSuccess | XmltvWorkerFailure;
