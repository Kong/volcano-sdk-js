/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, jest, test } from '@jest/globals';
import { commandRequest, pathId, requestOptions } from '../src/sandbox-request.ts';
import {
  commandResult,
  createRequest,
  encodeBytes,
  presetsResult,
  record,
  sessionRequest,
  sessionState,
  text,
} from '../src/sandbox-wire.ts';

const command = {
  stdout: '',
  stderr: '',
  exit_code: 0,
  timed_out: false,
  stdout_truncated: false,
  stderr_truncated: false,
};

describe('Sandbox wire validation', () => {
  test.each([null, undefined, 0, 'text', [], true])('rejects non-record %j', (value) => {
    expect(() => record(value)).toThrow('Invalid Sandbox response');
  });
  test('accepts records and text without coercion', () => {
    const value = { field: 'value' };
    expect(record(value)).toBe(value);
    expect(text('')).toBe('');
    expect(() => text(1)).toThrow('Invalid Sandbox text field');
  });
  test.each([Number.NaN, Number.POSITIVE_INFINITY, '0'])(
    'rejects invalid numeric fields %j',
    (exit_code) => {
      expect(() => commandResult({ ...command, exit_code })).toThrow(
        'Invalid Sandbox numeric field',
      );
    },
  );
  test('rejects non-boolean flags', () => {
    expect(() => commandResult({ ...command, timed_out: 'false' })).toThrow('Invalid Sandbox flag');
  });
  test.each([
    'starting',
    'running',
    'suspending',
    'suspended',
    'resuming',
    'terminating',
    'terminated',
    'unknown',
  ])('preserves session state %s', (state) => {
    expect(sessionState(state)).toBe(state);
  });
  test('rejects unknown session state', () => {
    expect(() => sessionState('future')).toThrow('Invalid Sandbox state');
  });
  test.each([
    { region: 'aws-us-east-1' },
    { region: 'aws-us-east-1', preset: 'node22' as const, sandboxId: 'template' },
  ])('requires exactly one selector %j', (options) => {
    expect(() => createRequest(options)).toThrow('Choose exactly one preset or sandboxId');
  });
  test.each([{}, { data: {} }, { data: [{ id: 'node22', memory_mb: 1024, regions: {} }] }])(
    'rejects malformed catalog %j',
    (value) => {
      const message =
        'data' in value && Array.isArray(value.data)
          ? 'Invalid Sandbox regions'
          : 'Invalid Sandbox preset catalog';
      expect(() => presetsResult(value)).toThrow(message);
    },
  );
  test('accepts the file limit and rejects the next byte', () => {
    const limit = 8 * 1024 * 1024;
    expect(encodeBytes(new Uint8Array(limit))).toHaveLength(Math.ceil(limit / 3) * 4);
    expect(() => encodeBytes(new Uint8Array(limit + 1))).toThrow(
      'Sandbox files are limited to 8 MiB',
    );
  });
});

test.each([
  'prefix11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111suffix',
])('rejects a UUID embedded in %s', (id) => {
  expect(() => pathId(id)).toThrow('A Sandbox resource ID must be a UUID');
});

test('forwards the caller abort signal and leaves absent signals untouched', () => {
  const generated = jest
    .fn<(mode: 'session', headers?: Record<string, string>) => object>()
    .mockImplementation(() => ({}));
  const client = { _completeOAuthExchange: () => Promise.resolve(), _generatedOptions: generated };
  const signal = new AbortController().signal;
  expect(requestOptions(client, { signal }).signal).toBe(signal);
  expect(requestOptions(client)).not.toHaveProperty('signal');
});

test('omits absent optional wire properties', () => {
  expect(createRequest({ preset: 'node22', region: 'aws-us-east-1' })).toStrictEqual({
    preset: 'node22',
    region: 'aws-us-east-1',
  });
  expect(
    createRequest({ sandboxId: 'template', region: 'aws-us-east-1', memoryMB: 2048 }),
  ).toStrictEqual({ sandbox_id: 'template', region: 'aws-us-east-1', memory_mb: 2048 });
  expect(commandRequest('true', {})).toStrictEqual({ command: 'true' });
  expect(commandRequest('true', { timeoutSeconds: 5, environment: { A: 'b' } })).toStrictEqual({
    command: 'true',
    timeout_seconds: 5,
    environment: { A: 'b' },
  });
  expect(sessionRequest({ preset: 'node22', region: 'aws-us-east-1' })).toStrictEqual({
    preset: 'node22',
    region: 'aws-us-east-1',
  });
  expect(
    sessionRequest({
      preset: 'node22',
      region: 'aws-us-east-1',
      maxDurationSeconds: 300,
      idleTimeoutSeconds: 60,
    }),
  ).toStrictEqual({
    preset: 'node22',
    region: 'aws-us-east-1',
    max_duration_seconds: 300,
    idle_timeout_seconds: 60,
  });
});
