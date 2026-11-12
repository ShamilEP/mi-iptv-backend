import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isSensitiveFieldName,
  redactLogFields,
  redactStringValue,
} from '../../src/infrastructure/logging/redact-log-fields.js';
import { JsonConsoleLogger } from '../../src/infrastructure/logging/json-console-logger.js';

describe('redactLogFields', () => {
  it('redacts sensitive keys and nested values', () => {
    const redacted = redactLogFields({
      path: '/auth/login',
      password: 'super-secret',
      refreshToken: 'jwt-refresh',
      nested: { sourcePassword: 'xtream', ok: true },
    });

    assert.equal(redacted.path, '/auth/login');
    assert.equal(redacted.password, '[REDACTED]');
    assert.equal(redacted.refreshToken, '[REDACTED]');
    assert.deepEqual(redacted.nested, {
      sourcePassword: '[REDACTED]',
      ok: true,
    });
  });

  it('scrubs userinfo from connection URLs', () => {
    assert.equal(
      redactStringValue('postgresql://user:secret@localhost:5432/db'),
      'postgresql://***:***@localhost:5432/db',
    );
  });

  it('recognizes sensitive field names', () => {
    assert.equal(isSensitiveFieldName('Authorization'), true);
    assert.equal(isSensitiveFieldName('SOURCE_CREDENTIALS_DATA_KEY'), true);
    assert.equal(isSensitiveFieldName('account_id'), false);
  });
});

describe('JsonConsoleLogger redaction', () => {
  it('does not emit raw tokens or passwords', () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      if (typeof message === 'string') {
        lines.push(message);
      }
    };

    try {
      const logger = new JsonConsoleLogger();
      logger.info('login attempt', {
        trace_id: 't1',
        account_id: 'a1',
        accessToken: 'eyJhbGciOiJSUzI1NiJ9.payload.sig',
        password: 'hunter2',
      });
    } finally {
      console.log = originalLog;
    }

    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    assert.equal(parsed.accessToken, '[REDACTED]');
    assert.equal(parsed.password, '[REDACTED]');
    assert.equal(parsed.trace_id, 't1');
    assert.ok(!JSON.stringify(parsed).includes('hunter2'));
    assert.ok(!JSON.stringify(parsed).includes('eyJhbGciOiJSUzI1NiJ9'));
  });
});
