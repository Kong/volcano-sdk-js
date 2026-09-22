/**
 * @jest-environment ./__tests__/node-environment.cjs
 */

import { describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index';

describe('VolcanoAuth Node storage handling', () => {
  it('should not restore auth session from Node global localStorage', async () => {
    expect(typeof window).toBe('undefined');

    localStorage.setItem('volcano_access_token', 'stored-token');
    localStorage.setItem('volcano_refresh_token', 'stored-refresh');

    const v = new VolcanoAuth({
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-test-key',
    });

    await expect(v.auth.getSession()).resolves.toEqual({ data: { session: null }, error: null });
    expect(jest.mocked(localStorage).getItem.mock.calls).toHaveLength(0);
    await expect(v.auth.signOut()).resolves.toEqual({ error: null });
    expect(jest.mocked(localStorage).removeItem.mock.calls).toHaveLength(0);
  });
});
