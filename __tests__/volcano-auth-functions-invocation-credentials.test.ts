/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import { config, fetchMock, resolvedFunction, withBrowserWindow } from './support/volcano-auth-functions-fixtures.ts';

const TEST_ACCESS_TOKEN = testAccessToken();
const TEST_ANON_KEY = `ak-${testAccessToken('00000000-0000-0000-0000-000000000001', { role: 'anon' })}`;
let volcano: VolcanoAuth;

withBrowserWindow();

beforeEach(() => {
  volcano = new VolcanoAuth(config);
});

function invokesWithSessionToken(): void {
  it('should invoke function successfully', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(resolvedFunction('my-function'));
    fetchMock.mockResolvedValueOnce(
      reply(200, { result: 'success', data: [1, 2, 3] }, { 'x-volcano-version': 'staging-xyz' }),
    );

    const { data, status, headers, version, error } = await volcano.functions.invoke('my-function', {
      action: 'getData',
    });

    expect(error).toBeNull();
    expect(status).toBe(200);
    expect(version).toBe('staging-xyz');
    expect(headers['x-volcano-version']).toBe('staging-xyz');
    expect(data).toEqual({ result: 'success', data: [1, 2, 3] });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.test.com/functions/resolve?name=my-function',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ payload: { action: 'getData' } }),
      }),
    );
  });
}

function invokesWithAnonKey(): void {
  it('should invoke a public function with the anon key when signed out', async () => {
    const anonymousVolcano = new VolcanoAuth({
      apiUrl: 'https://api.test.com',
      anonKey: TEST_ANON_KEY,
    });
    fetchMock
      .mockResolvedValueOnce(resolvedFunction('public-function'))
      .mockResolvedValueOnce(reply(200, { submitted: true }));

    const result = await anonymousVolcano.functions.invoke('public-function', {
      email: 'lead@example.com',
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ submitted: true });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.test.com/functions/resolve?name=public-function',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TEST_ANON_KEY}` }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TEST_ANON_KEY}` }),
      }),
    );
  });
}

function keepsAnonKeyRejections(): void {
  it('should not refresh after an anon-key invocation gets a gateway 401', async () => {
    const anonymousVolcano = new VolcanoAuth({
      apiUrl: 'https://api.test.com',
      anonKey: TEST_ANON_KEY,
    });
    anonymousVolcano.refreshToken = 'stale-refresh-token';
    const refresh = jest.spyOn(anonymousVolcano, '_refreshSessionForContext');
    fetchMock
      .mockResolvedValueOnce(resolvedFunction('public-function'))
      .mockResolvedValueOnce(reply(401, { error: 'Unauthorized' }));

    const result = await anonymousVolcano.functions.invoke('public-function');

    expect(result).toEqual(
      expect.objectContaining({
        data: null,
        status: 401,
        error: expect.objectContaining({ isSystemError: true }),
      }),
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
}

describe('VolcanoAuth function invocation and auth races', () => {
  invokesWithSessionToken();
  invokesWithAnonKey();
  keepsAnonKeyRejections();
});
