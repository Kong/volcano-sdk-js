const { VolcanoAuth, VolcanoClient } = require('../src/index.js');

describe('generated transport boundary', () => {
  test('VolcanoClient is the preferred alias for VolcanoAuth', () => {
    expect(VolcanoClient).toBe(VolcanoAuth);
  });

  test('the six contract operations delegate without changing response envelopes', async () => {
    const user = {
      id: 'user-123',
      email: 'contract@example.com',
      created_at: '2026-08-26T12:00:00Z',
      updated_at: '2026-08-26T12:00:00Z',
    };
    const session = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    };
    const row = { slug: 'contract-row', value: 'fixture-value' };
    const uploaded = { id: 'object-123', name: 'contract/object.bin', size: 5 };
    const downloaded = new Blob(['bytes'], { type: 'application/octet-stream' });
    const transport = {
      authSignin: jest.fn().mockResolvedValue({ data: { user, ...session }, status: 200 }),
      queryDatabaseSelect: jest
        .fn()
        .mockResolvedValue({ data: { data: [row], count: 1 }, status: 200 }),
      uploadStorageObject: jest.fn().mockResolvedValue({ data: uploaded, status: 201 }),
      downloadStorageObject: jest.fn().mockResolvedValue({ data: downloaded, status: 200 }),
      acquireProjectLock: jest.fn().mockResolvedValue({
        data: { expires_at: '2026-08-26T12:00:10Z', fencing_token: 7 },
        status: 201,
      }),
      releaseProjectLock: jest.fn().mockResolvedValue({ data: undefined, status: 204 }),
    };
    const transportFactory = jest.fn(() => transport);
    const volcano = new VolcanoClient({
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-contract',
      transportFactory,
    });

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
    await expect(
      volcano.locks.release('contract:lock', acquired.lease, {
        requestId: '10000000-0000-4000-8000-000000000002',
      }),
    ).resolves.toEqual({ error: null });

    expect(transportFactory).toHaveBeenCalledWith(volcano);
    expect(transport.authSignin).toHaveBeenCalledWith(
      { email: 'contract@example.com', password: 'correct-password' },
      expect.objectContaining({ volcanoAuthorization: 'anon', volcanoClient: volcano }),
    );
    expect(transport.queryDatabaseSelect).toHaveBeenCalledWith(
      'contract%20database',
      {
        table: 'contract_table',
        filters: [{ column: 'slug', operator: 'eq', value: 'contract-row' }],
      },
      expect.objectContaining({ volcanoAuthorization: 'session', volcanoClient: volcano }),
    );
    expect(transport.uploadStorageObject).toHaveBeenCalledWith(
      'contract%20bucket',
      'contract/object%20name.bin',
      { file },
      expect.objectContaining({ volcanoAuthorization: 'session', volcanoClient: volcano }),
    );
    expect(transport.downloadStorageObject).toHaveBeenCalledWith(
      'contract%20bucket',
      'contract/object%20name.bin',
      expect.objectContaining({ volcanoAuthorization: 'session', volcanoClient: volcano }),
    );
    expect(transport.acquireProjectLock).toHaveBeenCalledWith(
      'contract%3Alock',
      { ttl_seconds: 10 },
      expect.objectContaining({
        headers: {
          'X-Volcano-Lock-Token': lockOptions.token,
          'X-Volcano-Request-Id': lockOptions.requestId,
        },
        volcanoAuthorization: 'session',
        volcanoClient: volcano,
      }),
    );
    expect(transport.releaseProjectLock).toHaveBeenCalledWith(
      'contract%3Alock',
      expect.objectContaining({
        headers: {
          'X-Volcano-Lock-Token': lockOptions.token,
          'X-Volcano-Request-Id': '10000000-0000-4000-8000-000000000002',
        },
        volcanoAuthorization: 'session',
        volcanoClient: volcano,
      }),
    );
  });
});
