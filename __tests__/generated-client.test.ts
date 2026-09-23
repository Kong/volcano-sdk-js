import { describe, expect, jest, test } from '@jest/globals';
import type {
  acquireProjectLockResponseSuccess,
  authSigninResponseSuccess,
  downloadStorageObjectResponseSuccess,
  queryDatabaseSelectResponseSuccess,
  releaseProjectLockResponseSuccess,
  uploadStorageObjectResponse,
} from '../src/generated/client.ts';
import type { AuthUser } from '../src/generated/model/authUser.ts';
import type { StorageObject } from '../src/generated/model/storageObject.ts';
import type { operations } from '../src/generated/openapi.d.ts';
import { VolcanoAuth, type VolcanoAuthConfig, VolcanoClient } from '../src/index.js';

type GeneratedTransport = Pick<
  typeof import('../src/generated/client.ts'),
  | 'authSignin'
  | 'queryDatabaseSelect'
  | 'uploadStorageObject'
  | 'downloadStorageObject'
  | 'acquireProjectLock'
  | 'releaseProjectLock'
>;

describe('generated transport boundary', () => {
  test('VolcanoClient is the preferred alias for VolcanoAuth', () => {
    expect(VolcanoClient).toBe(VolcanoAuth);
  });

  test('the six contract operations delegate without changing response envelopes', async () => {
    const user = {
      id: 'user-123',
      email: 'contract@example.com',
      status: 'active',
      created_at: '2026-08-26T12:00:00Z',
      updated_at: '2026-08-26T12:00:00Z',
    } satisfies AuthUser;
    const session = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    };
    const row = { slug: 'contract-row', value: 'fixture-value' };
    const uploaded = {
      id: 'object-123',
      bucket_id: 'bucket-123',
      name: 'contract/object.bin',
      is_public: false,
      size: 5,
      mime_type: 'application/octet-stream',
    } satisfies StorageObject &
      operations['uploadStorageObject']['responses'][201]['content']['application/json'];
    const downloaded = new Blob(['bytes'], { type: 'application/octet-stream' });
    const headers = new Headers();
    const transport = {
      authSignin: jest.fn<GeneratedTransport['authSignin']>(() =>
        Promise.resolve({
          data: { user, ...session, token_type: 'bearer' },
          status: 200,
          headers,
        } satisfies authSigninResponseSuccess),
      ),
      queryDatabaseSelect: jest.fn<GeneratedTransport['queryDatabaseSelect']>(() =>
        Promise.resolve({
          data: { data: [row], count: 1 },
          status: 200,
          headers,
        } satisfies queryDatabaseSelectResponseSuccess),
      ),
      uploadStorageObject: jest.fn<GeneratedTransport['uploadStorageObject']>(() =>
        Promise.resolve({
          data: uploaded,
          status: 201 satisfies keyof Pick<operations['uploadStorageObject']['responses'], 201>,
          headers,
        } satisfies uploadStorageObjectResponse),
      ),
      downloadStorageObject: jest.fn<GeneratedTransport['downloadStorageObject']>(() =>
        Promise.resolve({
          data: downloaded,
          status: 200,
          headers,
        } satisfies downloadStorageObjectResponseSuccess),
      ),
      acquireProjectLock: jest.fn<GeneratedTransport['acquireProjectLock']>(() =>
        Promise.resolve({
          data: { expires_at: '2026-08-26T12:00:10Z', fencing_token: 7 },
          status: 201,
          headers,
        } satisfies acquireProjectLockResponseSuccess),
      ),
      releaseProjectLock: jest.fn<GeneratedTransport['releaseProjectLock']>(() =>
        Promise.resolve({
          data: undefined,
          status: 204,
          headers,
        } satisfies releaseProjectLockResponseSuccess),
      ),
    } satisfies GeneratedTransport;
    const transportFactory = jest.fn<(client: VolcanoAuth) => typeof transport>(() => transport);
    const config: VolcanoAuthConfig & {
      transportFactory: (client: VolcanoAuth) => typeof transport;
    } = {
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-contract',
      transportFactory,
    };
    const volcano = new VolcanoClient(config);

    await expect(
      volcano.auth.signIn({ email: 'contract@example.com', password: 'correct-password' }),
    ).resolves.toEqual({ user, session, error: null });
    volcano.database('contract database');
    await expect(
      volcano.from('contract_table').select('*').eq('slug', 'contract-row'),
    ).resolves.toEqual({ data: [row], count: 1, error: null });

    const file = new File(['bytes'], 'object.bin', { type: 'application/octet-stream' });
    await expect(
      volcano.storage.from('contract bucket').upload('contract/object name.bin', file),
    ).resolves.toEqual({ data: uploaded, error: null });
    await expect(
      volcano.storage.from('contract bucket').download('contract/object name.bin'),
    ).resolves.toEqual({ data: downloaded, error: null });

    const lockOptions = {
      ttl: 10,
      token: '00000000-0000-4000-8000-000000000001',
      requestId: '10000000-0000-4000-8000-000000000001',
    };
    const acquired = await volcano.locks.acquire('contract:lock', lockOptions);
    expect(acquired).toEqual({
      acquired: true,
      lease: {
        key: 'contract:lock',
        token: lockOptions.token,
        expiresAt: '2026-08-26T12:00:10Z',
        fencingToken: 7,
      },
      error: null,
    });
    if (acquired.lease === null) {
      throw new Error('Expected an acquired lock lease');
    }
    await expect(
      volcano.locks.release('contract:lock', acquired.lease, {
        requestId: '10000000-0000-4000-8000-000000000002',
      }),
    ).resolves.toEqual({ error: null });

    expect(transportFactory).toHaveBeenCalledWith(volcano);
    const signInArgs = [
      { email: 'contract@example.com', password: 'correct-password' },
      { volcanoAuthorization: 'anon' },
    ] satisfies Parameters<GeneratedTransport['authSignin']>;
    expect(transport.authSignin).toHaveBeenCalledWith(
      signInArgs[0],
      expect.objectContaining({ ...signInArgs[1], volcanoClient: volcano }),
    );
    const selectArgs = [
      'contract%20database',
      {
        table: 'contract_table',
        filters: [{ column: 'slug', operator: 'eq', value: 'contract-row' }],
      },
      { volcanoAuthorization: 'session' },
    ] satisfies Parameters<GeneratedTransport['queryDatabaseSelect']>;
    expect(transport.queryDatabaseSelect).toHaveBeenCalledWith(
      selectArgs[0],
      selectArgs[1],
      expect.objectContaining({ ...selectArgs[2], volcanoClient: volcano }),
    );
    const uploadArgs = [
      'contract%20bucket',
      'contract/object%20name.bin',
      { file },
      { volcanoAuthorization: 'session' },
    ] satisfies Parameters<GeneratedTransport['uploadStorageObject']>;
    expect(transport.uploadStorageObject).toHaveBeenCalledWith(
      uploadArgs[0],
      uploadArgs[1],
      uploadArgs[2],
      expect.objectContaining({ ...uploadArgs[3], volcanoClient: volcano }),
    );
    const downloadArgs = [
      'contract%20bucket',
      'contract/object%20name.bin',
      { volcanoAuthorization: 'session' },
    ] satisfies Parameters<GeneratedTransport['downloadStorageObject']>;
    expect(transport.downloadStorageObject).toHaveBeenCalledWith(
      downloadArgs[0],
      downloadArgs[1],
      expect.objectContaining({ ...downloadArgs[2], volcanoClient: volcano }),
    );
    const acquireArgs = [
      'contract%3Alock',
      { ttl_seconds: 10 },
      {
        headers: {
          Authorization: 'Bearer access-token',
          'X-Volcano-Lock-Token': lockOptions.token,
          'X-Volcano-Request-Id': lockOptions.requestId,
        },
        volcanoAuthorization: 'anon',
      },
    ] satisfies Parameters<GeneratedTransport['acquireProjectLock']>;
    expect(transport.acquireProjectLock).toHaveBeenCalledWith(
      acquireArgs[0],
      acquireArgs[1],
      expect.objectContaining({ ...acquireArgs[2], volcanoClient: volcano }),
    );
    const releaseArgs = [
      'contract%3Alock',
      {
        headers: {
          'X-Volcano-Lock-Token': lockOptions.token,
          'X-Volcano-Request-Id': '10000000-0000-4000-8000-000000000002',
        },
        volcanoAuthorization: 'session',
      },
    ] satisfies Parameters<GeneratedTransport['releaseProjectLock']>;
    expect(transport.releaseProjectLock).toHaveBeenCalledWith(
      releaseArgs[0],
      expect.objectContaining({ ...releaseArgs[1], volcanoClient: volcano }),
    );
  });
});
