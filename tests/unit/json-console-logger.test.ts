import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JsonConsoleLogger } from '../../src/infrastructure/logging/json-console-logger.js';
import { getEnvironmentDefaults } from '../../src/config/environments/index.js';
import { resolveTraceId } from '../../src/shared/trace-id.js';

describe('JsonConsoleLogger', () => {
  it('emits JSON with required structured fields', () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      if (typeof message === 'string') {
        lines.push(message);
      }
    };

    try {
      const logger = new JsonConsoleLogger({
        trace_id: 'trace-1',
        account_id: 'account-1',
      });
      logger.info('hello', { path: '/health' });
    } finally {
      console.log = originalLog;
    }

    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    assert.equal(parsed.level, 'info');
    assert.equal(parsed.service, 'mi-iptv-backend');
    assert.equal(parsed.trace_id, 'trace-1');
    assert.equal(parsed.account_id, 'account-1');
    assert.equal(parsed.message, 'hello');
    assert.equal(typeof parsed.timestamp, 'string');
  });
});

describe('environment defaults', () => {
  it('provides distinct DEV/QA/PROD defaults', () => {
    assert.equal(getEnvironmentDefaults('dev').appEnv, 'dev');
    assert.equal(getEnvironmentDefaults('qa').appEnv, 'qa');
    assert.equal(getEnvironmentDefaults('prod').appEnv, 'prod');
    assert.equal(getEnvironmentDefaults('dev').logLevel, 'debug');
  });
});

describe('resolveTraceId', () => {
  it('reuses inbound x-trace-id when present', () => {
    assert.equal(resolveTraceId({ 'x-trace-id': 'abc' }), 'abc');
  });
});
