import type { ServerClientConfig, User } from '../../src/next/middleware.ts';

export const config: ServerClientConfig = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

export function user(id: string): User {
  return {
    id,
    email: 'test@example.com',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}
