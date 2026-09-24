import { ContractWorld } from './world.ts';

describe('contract world cleanup', () => {
  test('reports lock release error envelopes as cleanup failures', async () => {
    const world = new ContractWorld({
      api_url: 'https://api.test.com',
      anon_key: 'ak-contract',
      service_key: 'sk-contract',
      platform_token: 'platform-token',
      project_id: 'project',
      user_id: 'user',
      user_email: 'user@example.com',
      user_password: 'password',
      storage_path: 'object',
      realtime_channel: 'channel',
      lock_key: 'lock',
      function_name: 'function',
      durable_function_name: 'durable',
      database_name: 'database',
      realtime_table_name: 'records',
      bucket_name: 'bucket',
      function_id: 'function-id',
      logs_access_token: 'logs-token',
      table_name: 'rows',
      query_table_name: 'rows_queries',
      fixture_row: { slug: 'contract', value: 'original' },
      mutation_rows: {
        insert: { slug: 'contract-insert', value: 'insert' },
        update: {
          before: { slug: 'contract-update', value: 'before' },
          after: { slug: 'contract-update', value: 'after' },
        },
        delete: { slug: 'contract-delete', value: 'delete' },
      },
    });
    const releaseError = Object.assign(new Error('lock release failed'), { status: 503 });
    world.serviceClient.locks.release = () => Promise.resolve({ error: releaseError });
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
