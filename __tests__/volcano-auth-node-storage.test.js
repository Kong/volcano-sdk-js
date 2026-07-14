/**
 * @jest-environment node
 */

const { createVolcanoClient } = require('../src/index.js');

describe('createVolcanoClient Node storage handling', () => {
  it('should not restore auth session from Node global localStorage', () => {
    expect(typeof window).toBe('undefined');

    localStorage.store['volcano_access_token'] = 'stored-token';
    localStorage.store['volcano_refresh_token'] = 'stored-refresh';

    const v = createVolcanoClient({
      anonKey: 'ak-test-key',
      baseUrl: 'https://api.test.com',
    });

    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(() => v.auth.signOut()).not.toThrow();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });
});
