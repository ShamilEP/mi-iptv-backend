export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = {
  readonly trace_id?: string | null;
  readonly account_id?: string | null;
  readonly [key: string]: unknown;
};

/**
 * Structured application logger (Infra §4.1).
 * Implementations must emit JSON with timestamp, level, service, trace_id, account_id, message.
 * Implementations must redact tokens, passwords, and source credentials (SEC-003).
 */
export interface Logger {
  child(bindings: LogFields): Logger;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}
