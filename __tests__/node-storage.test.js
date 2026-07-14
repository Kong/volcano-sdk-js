/**
 * @jest-environment node
 */

const { createVolcanoClient } = require('../src/index.js');

describe('createVolcanoClient Node storage handling', () => {
  it('does not restore an auth session from a Node global localStorage', () => {
    expect(typeof window).toBe('undefined');

    localStorage.store.volcano_access_token = 'stored-token';
    localStorage.store.volcano_refresh_token = 'stored-refresh';

    const volcano = createVolcanoClient({
      anonKey: 'ak-test-key',
      baseUrl: 'https://api.test.com',
    });

    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(() => volcano.auth.signOut()).not.toThrow();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });
});
