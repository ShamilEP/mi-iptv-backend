import type {
  LogFields,
  LogLevel,
  Logger,
} from '../../application/ports/logger.js';
import { redactLogFields } from './redact-log-fields.js';

const SERVICE_NAME = 'mi-iptv-backend';

/**
 * Structured JSON logger. Sensitive fields are redacted before emit (SEC-003).
 */
export class JsonConsoleLogger implements Logger {
  constructor(private readonly bindings: LogFields = {}) {}

  child(bindings: LogFields): Logger {
    return new JsonConsoleLogger({ ...this.bindings, ...bindings });
  }

  debug(message: string, fields?: LogFields): void {
    this.write('debug', message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.write('info', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.write('warn', message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.write('error', message, fields);
  }

  private write(level: LogLevel, message: string, fields?: LogFields): void {
    const merged = { ...this.bindings, ...fields };
    const safeRest = redactLogFields(omitReserved(merged));
    const line = {
      timestamp: new Date().toISOString(),
      level,
      service: SERVICE_NAME,
      trace_id: merged.trace_id ?? null,
      account_id: merged.account_id ?? null,
      message,
      ...safeRest,
    };
    const payload = JSON.stringify(line);
    if (level === 'error') {
      console.error(payload);
      return;
    }
    console.log(payload);
  }
}

function omitReserved(fields: LogFields): Record<string, unknown> {
  const {
    trace_id: _t,
    account_id: _a,
    timestamp: _ts,
    level: _l,
    service: _s,
    message: _m,
    ...rest
  } = fields;
  return rest;
}
