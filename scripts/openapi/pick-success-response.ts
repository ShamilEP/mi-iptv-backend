import { pickMediaExample } from './schema-example.js';
import type { OpenApiDocument, OperationObject, ResponseObject } from './types.js';

export type MockSuccessResponse = {
  readonly status: number;
  readonly body: unknown;
  readonly contentType: string | undefined;
};

/**
 * Picks the first 2xx response and builds a JSON body from example/schema.
 */
export function pickSuccessMockResponse(
  doc: OpenApiDocument,
  operation: OperationObject,
): MockSuccessResponse {
  const responses = operation.responses ?? {};
  const preferred = ['200', '201', '202', '204'];
  for (const code of preferred) {
    const response = responses[code];
    if (!response) continue;
    return toMock(doc, Number(code), response);
  }

  for (const [code, response] of Object.entries(responses)) {
    const status = Number(code);
    if (!Number.isFinite(status) || status < 200 || status >= 300 || !response) {
      continue;
    }
    return toMock(doc, status, response);
  }

  return {
    status: 200,
    body: { mock: true },
    contentType: 'application/json',
  };
}

function toMock(
  doc: OpenApiDocument,
  status: number,
  response: ResponseObject,
): MockSuccessResponse {
  if (status === 204) {
    return { status, body: undefined, contentType: undefined };
  }
  const json = response.content?.['application/json'];
  if (json) {
    return {
      status,
      body: pickMediaExample(doc, json) ?? {},
      contentType: 'application/json',
    };
  }
  const first = Object.entries(response.content ?? {})[0];
  if (first) {
    const [contentType, media] = first;
    return {
      status,
      body: pickMediaExample(doc, media) ?? null,
      contentType,
    };
  }
  return { status, body: undefined, contentType: undefined };
}
