const { ContractWorld } = require('./world.js');

describe('contract world cleanup', () => {
  test('creates isolated authentication identities and listener state', () => {
    const fixture = {
      api_url: 'https://api.test.com',
      anon_key: 'ak-contract',
      service_key: 'sk-contract',
      storage_path: 'contract/object.bin',
      realtime_channel: 'contract-channel',
      lock_key: 'contract-lock',
    };
    const first = new ContractWorld(fixture);
    const second = new ContractWorld(fixture);

    expect(first.uniqueEmail).toMatch(/^js-\d+-[a-f0-9]+@example\.com$/);
    expect(first.uniqueEmail).not.toBe(second.uniqueEmail);
    expect(first.uniquePassword).not.toBe(second.uniquePassword);
    expect(first.metadataMarker).not.toBe(second.metadataMarker);
    expect(first.listenerEvents).toEqual([]);
    expect(first.listenerEventCount).toBe(0);
    expect(first.unsubscribeAuth).toBeNull();
    expect(first.anonymousUserId).toBeNull();
    expect(first.deletedSessionId).toBeNull();
  });

  test('reports lock release error envelopes as cleanup failures', async () => {
    const world = new ContractWorld({
      api_url: 'https://api.test.com',
      anon_key: 'ak-contract',
      service_key: 'sk-contract',
    });
    const releaseError = Object.assign(new Error('lock release failed'), { status: 503 });
    world.serviceClient.locks.release = async () => ({ error: releaseError });
    world.registerLockCleanup('contract-lock', {
      key: 'contract-lock',
      token: '00000000-0000-4000-8000-000000000001',
      expiresAt: '2026-08-26T12:00:10Z',
      fencingToken: 1,
    });

    await expect(world.cleanup()).rejects.toMatchObject({
      errors: [releaseError],
      message: 'JavaScript contract cleanup failed',
    });
  });
});
