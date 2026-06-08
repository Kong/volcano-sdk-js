/**
 * @jest-environment node
 */

const VolcanoAuth = require('../src/index.js');

describe('VolcanoAuth Node storage handling', () => {
  it('should not restore auth session from Node global localStorage', () => {
    expect(typeof window).toBe('undefined');

    localStorage.store['volcano_access_token'] = 'stored-token';
    localStorage.store['volcano_refresh_token'] = 'stored-refresh';

    const v = new VolcanoAuth({
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-test-key',
    });

    expect(v.accessToken).toBeNull();
    expect(v.refreshToken).toBeNull();
    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(() => v.auth.signOut()).not.toThrow();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });
});
