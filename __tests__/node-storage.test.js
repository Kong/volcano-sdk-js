/**
 * @jest-environment node
 */

const { createVolcanoClient } = require('../src/index.ts');

describe('createVolcanoClient Node storage handling', () => {
  const tokenForProject = (projectId, prefix = '') =>
    prefix +
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') +
    '.' +
    Buffer.from(JSON.stringify({ project_id: projectId })).toString('base64url') +
    '.signature';

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

  it('derives public URLs from service-role credentials', () => {
    const volcano = createVolcanoClient({
      baseUrl: 'https://api.test.com',
      serviceRoleKey: tokenForProject('service-project', 'sk-'),
    });

    const { data, error } = volcano.storage.from('files').getPublicUrl('file.txt');

    expect(error).toBeNull();
    expect(data.publicUrl).toBe('https://api.test.com/public/service-project/files/file.txt');
  });

  it('prefers the access-token project over service-role and anon projects', () => {
    const volcano = createVolcanoClient({
      accessToken: tokenForProject('access-project'),
      anonKey: tokenForProject('anon-project', 'ak-'),
      baseUrl: 'https://api.test.com',
      serviceRoleKey: tokenForProject('service-project', 'sk-'),
    });

    const { data, error } = volcano.storage.from('files').getPublicUrl('file.txt');

    expect(error).toBeNull();
    expect(data.publicUrl).toBe('https://api.test.com/public/access-project/files/file.txt');
  });
});
