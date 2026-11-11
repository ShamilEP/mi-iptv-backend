import { randomUUID } from 'node:crypto';

const TRACE_HEADER = 'x-trace-id';

export function resolveTraceId(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): string {
  const raw = headers[TRACE_HEADER] ?? headers['X-Trace-Id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }
  return randomUUID();
}

export { TRACE_HEADER };
