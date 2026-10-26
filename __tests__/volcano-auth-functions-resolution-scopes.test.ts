/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import {
  config,
  expectFetchSequence,
  fetchMock,
  resolvedFunction,
  withBrowserWindow,
} from './support/volcano-auth-functions-fixtures.ts';

const TEST_ACCESS_TOKEN_PROJECT_A = testAccessToken();
const TEST_ACCESS_TOKEN_PROJECT_B = testAccessToken('00000000-0000-0000-0000-000000000002');
const TEST_ACCESS_TOKEN_SHARED = testAccessToken('00000000-0000-0000-0000-000000000010');
let volcano: VolcanoAuth;

withBrowserWindow();

beforeEach(() => {
  volcano = new VolcanoAuth(config);
});

function sharesCacheForSameToken(): void {
  it('should share resolver cache across instances with the same server-side token', async () => {
    jest.clearAllMocks();
    const sharedToken = TEST_ACCESS_TOKEN_SHARED;
    const instanceA = new VolcanoAuth({ ...config, accessToken: sharedToken });
    const instanceB = new VolcanoAuth({ ...config, accessToken: sharedToken });

    fetchMock
      .mockResolvedValueOnce(resolvedFunction('my-function'))
      .mockImplementation(() => Promise.resolve(reply(200, { result: 'ok' })));

    const first = await instanceA.functions.invoke('my-function', { call: 1 });
    const second = await instanceB.functions.invoke('my-function', { call: 2 });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
    expectFetchSequence([
      ['https://api.test.com/functions/resolve?name=my-function', 'GET'],
      ['https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/', 'POST'],
      ['https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/', 'POST'],
    ]);
    const storageRead: unknown = Reflect.get(localStorage, 'getItem');
    expect(storageRead).not.toHaveBeenCalled();
  });
}

function isolatesCacheAcrossProjects(): void {
  it('should isolate resolver cache across different auth scopes', async () => {
    jest.clearAllMocks();
    const instanceA = new VolcanoAuth({ ...config, accessToken: TEST_ACCESS_TOKEN_PROJECT_A });
    const instanceB = new VolcanoAuth({ ...config, accessToken: TEST_ACCESS_TOKEN_PROJECT_B });

    fetchMock
      .mockResolvedValueOnce(resolvedFunction('shared-name', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
      .mockResolvedValueOnce(reply(200, { result: 'from-a' }))
      .mockResolvedValueOnce(resolvedFunction('shared-name', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))
      .mockResolvedValueOnce(reply(200, { result: 'from-b' }));

    const a = await instanceA.functions.invoke('shared-name', {});
    const b = await instanceB.functions.invoke('shared-name', {});

    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(4);
    expectFetchSequence([
      ['https://api.test.com/functions/resolve?name=shared-name', 'GET'],
      ['https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/', 'POST'],
      ['https://api.test.com/functions/resolve?name=shared-name', 'GET'],
      ['https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/', 'POST'],
    ]);
  });
}

function isolatesCacheAcrossTokens(): void {
  it('should isolate resolver cache for different tokens in the same project', async () => {
    jest.clearAllMocks();
    const tokenOne = testAccessToken('00000000-0000-0000-0000-0000000000aa', { sid: 'one' });
    const tokenTwo = testAccessToken('00000000-0000-0000-0000-0000000000aa', { sid: 'two' });

    const instanceA = new VolcanoAuth({ ...config, accessToken: tokenOne });
    const instanceB = new VolcanoAuth({ ...config, accessToken: tokenTwo });

    fetchMock
      .mockResolvedValueOnce(resolvedFunction('same-name', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
      .mockResolvedValueOnce(reply(200, { result: 'token-one' }))
      .mockResolvedValueOnce(resolvedFunction('same-name', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))
      .mockResolvedValueOnce(reply(200, { result: 'token-two' }));

    const first = await instanceA.functions.invoke('same-name', {});
    const second = await instanceB.functions.invoke('same-name', {});

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(4);
    expectFetchSequence([
      ['https://api.test.com/functions/resolve?name=same-name', 'GET'],
      ['https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/', 'POST'],
      ['https://api.test.com/functions/resolve?name=same-name', 'GET'],
      ['https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/', 'POST'],
    ]);
  });
}

function forgetsCacheAfterTokenChange(): void {
  it('should not reuse resolver cache after auth token changes on the same instance', async () => {
    jest.clearAllMocks();
    volcano.accessToken = TEST_ACCESS_TOKEN_PROJECT_A;

    fetchMock
      .mockResolvedValueOnce(resolvedFunction('my-function', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
      .mockResolvedValueOnce(reply(200, { result: 'from-a' }))
      .mockResolvedValueOnce(resolvedFunction('my-function', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))
      .mockResolvedValueOnce(reply(200, { result: 'from-b' }));

    const first = await volcano.functions.invoke('my-function', {});
    volcano.accessToken = TEST_ACCESS_TOKEN_PROJECT_B;
    const second = await volcano.functions.invoke('my-function', {});

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(4);
    expectFetchSequence([
      ['https://api.test.com/functions/resolve?name=my-function', 'GET'],
      ['https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/', 'POST'],
      ['https://api.test.com/functions/resolve?name=my-function', 'GET'],
      ['https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/', 'POST'],
    ]);
  });
}

describe('VolcanoAuth function resolution, cache, and input validation', () => {
  describe('Functions', () => {
    sharesCacheForSameToken();
    isolatesCacheAcrossProjects();
    isolatesCacheAcrossTokens();
    forgetsCacheAfterTokenChange();
  });
});
