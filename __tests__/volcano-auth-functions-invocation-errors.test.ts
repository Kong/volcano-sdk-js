/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { VolcanoAuth, VolcanoSystemError } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import { config, fetchMock, resolvedFunction, withBrowserWindow } from './support/volcano-auth-functions-fixtures.ts';

const TEST_ACCESS_TOKEN = testAccessToken();
let volcano: VolcanoAuth;

withBrowserWindow();

beforeEach(() => {
  volcano = new VolcanoAuth(config);
});

function reportsPlatformRefusals(): void {
  it('should reject non-hostname-safe identifiers (no fallback)', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    const { error } = await volcano.functions.invoke('get_my_profile', { action: 'getData' });

    expect(error).toBeDefined();
    expect(error?.message).toContain('DNS-safe');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should surface a platform-blocked invocation as a VolcanoSystemError', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    // Resolve succeeds...
    fetchMock.mockResolvedValueOnce(resolvedFunction('my-function'));
    // ...but the platform blocks the invocation: 400 carrying the version
    // stamp, which every response gets, and no dispatch marker, because
    // nothing ran. Omitting the version header here would be a shape the
    // server never produces, and would let a check keyed on it pass.
    fetchMock.mockResolvedValueOnce(
      reply(400, { error: 'function cannot be invoked (status: failed)' }, { 'x-volcano-version': 'v1' }),
    );

    const { data, status, error } = await volcano.functions.invoke('my-function', {
      action: 'getData',
    });

    expect(data).toBeNull();
    expect(status).toBe(400);
    expect(error).toBeInstanceOf(VolcanoSystemError);
    expect(VolcanoSystemError.is(error)).toBe(true);
    if (!VolcanoSystemError.is(error)) {
      throw new TypeError('Expected a system error');
    }
    expect(error.isSystemError).toBe(true);
    expect(error.status).toBe(400);
    expect(error.message).toBe('function cannot be invoked (status: failed)');
    // Extra fields are non-enumerable → serialization shape matches a plain
    // Error (additive, no surprise for consumer log/redaction pipelines).
    expect(Object.keys(error)).toEqual([]);
    expect(JSON.stringify(error)).toBe('{}');
    expect(error.name).toBe('VolcanoSystemError');
  });
}

function reportsTransportFailures(): void {
  it('VolcanoSystemError.is() only matches system errors', () => {
    expect(VolcanoSystemError.is(new VolcanoSystemError('x', { status: 503 }))).toBe(true);
    expect(VolcanoSystemError.is(new Error('plain'))).toBe(false);
    expect(VolcanoSystemError.is(null)).toBe(false);
    expect(VolcanoSystemError.is(undefined)).toBe(false);
    expect(VolcanoSystemError.is('boom')).toBe(false);
    // Duck-typed brand → holds across a duplicate class identity.
    expect(VolcanoSystemError.is({ isSystemError: true })).toBe(true);
  });

  it('should surface a transport failure as a VolcanoSystemError with null status and cause', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    // Resolve succeeds...
    fetchMock.mockResolvedValueOnce(resolvedFunction('my-function'));
    // ...but the invocation fetch rejects (network down / DNS / offline).
    const networkError = new Error('network down');
    fetchMock.mockRejectedValueOnce(networkError);

    const { data, status, error } = await volcano.functions.invoke('my-function', {
      action: 'getData',
    });

    expect(data).toBeNull();
    expect(status).toBeNull();
    expect(error).toBeInstanceOf(VolcanoSystemError);
    if (!VolcanoSystemError.is(error)) {
      throw new TypeError('Expected a system error');
    }
    expect(error.isSystemError).toBe(true);
    expect(error.status).toBeNull();
    expect(error.message).toBe('network down');
    expect(error.cause).toBe(networkError);
  });
}

describe('VolcanoAuth function invocation and auth races', () => {
  reportsPlatformRefusals();
  reportsTransportFailures();
});
