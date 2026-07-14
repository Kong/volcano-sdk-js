const { createVolcanoClient } = require('../src/index.js');

const jsonResponse = (body, status = 200) => ({
  json: () => Promise.resolve(body),
  ok: status >= 200 && status < 300,
  status,
});

const projectToken = (projectId) => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ project_id: projectId })}.signature`;
};

describe('createVolcanoClient auth and session behavior', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    window.sessionStorage.clear();
  });

  it('exposes only the factory-oriented root surface', () => {
    const sdk = require('../src/index.js');
    const volcano = createVolcanoClient({ anonKey: 'anon-key' });

    expect(sdk.VolcanoAuth).toBeUndefined();
    expect(Object.keys(volcano).sort()).toEqual([
      'api',
      'auth',
      'database',
      'functions',
      'storage',
    ]);
    expect(volcano.logs).toBeUndefined();
  });

  it('accepts each top-level credential without requiring an anon key', () => {
    expect(() => createVolcanoClient({ accessToken: 'access-token' })).not.toThrow();
    expect(() => createVolcanoClient({ userToken: 'user-token' })).not.toThrow();
  });

  it('rejects a service-role credential in a browser', () => {
    expect(() => createVolcanoClient({ serviceRoleKey: 'sk-secret' })).toThrow(
      'Service keys (sk-*) cannot be used in client-side code',
    );
  });

  it('signs in through the generated operation and persists the session', async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse({
        access_token: 'access-token',
        expires_in: 3600,
        refresh_token: 'refresh-token',
        user: { email: 'user@example.com', id: 'user-id' },
      }),
    );
    const volcano = createVolcanoClient({
      anonKey: 'anon-key',
      baseUrl: 'https://api.test.com',
    });
    const callback = jest.fn();
    volcano.auth.onAuthStateChange(callback);
    callback.mockClear();

    const result = await volcano.auth.signIn({
      email: 'user@example.com',
      password: 'secret',
    });

    expect(result.error).toBeNull();
    expect(result.user).toEqual({ email: 'user@example.com', id: 'user-id' });
    expect(volcano.auth.user()).toEqual(result.user);
    expect(localStorage.store.volcano_access_token).toBe('access-token');
    expect(localStorage.store.volcano_refresh_token).toBe('refresh-token');
    expect(callback).toHaveBeenCalledWith(result.user);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.test.com/auth/signin');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer anon-key');
    expect(JSON.parse(init.body)).toEqual({ email: 'user@example.com', password: 'secret' });
  });

  it('keeps signup sessionless unless automatic sign-in is requested', async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ confirmation_required: false, message: 'Account created' }),
    );
    const volcano = createVolcanoClient({ anonKey: 'anon-key' });

    const result = await volcano.auth.signUp({
      email: 'user@example.com',
      password: 'secret',
    });

    expect(result).toEqual({
      confirmationRequired: false,
      error: null,
      message: 'Account created',
      session: null,
      user: null,
    });
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('clears local state even when logout is best-effort', async () => {
    localStorage.store.volcano_access_token = 'access-token';
    localStorage.store.volcano_refresh_token = 'refresh-token';
    global.fetch.mockResolvedValueOnce(jsonResponse({}));
    const volcano = createVolcanoClient({ anonKey: 'anon-key' });

    await expect(volcano.auth.signOut()).resolves.toEqual({ error: null });

    expect(volcano.auth.user()).toBeNull();
    expect(localStorage.removeItem).toHaveBeenCalledWith('volcano_access_token');
    expect(localStorage.removeItem).toHaveBeenCalledWith('volcano_refresh_token');
  });

  it('routes session management through generated operations', async () => {
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          limit: 10,
          page: 2,
          sessions: [{ id: 'session-id' }],
          total: 1,
          total_pages: 1,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    const volcano = createVolcanoClient({
      accessToken: 'access-token',
      baseUrl: 'https://api.test.com',
    });

    const sessions = await volcano.auth.getSessions({ limit: 10, page: 2 });
    await volcano.auth.deleteSession('session-id');
    await volcano.auth.deleteAllOtherSessions();

    expect(sessions.sessions).toEqual([{ id: 'session-id' }]);
    expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.test.com/auth/user/sessions?limit=10&page=2',
      'https://api.test.com/auth/user/sessions/session-id',
      'https://api.test.com/auth/user/sessions',
    ]);
  });

  it('creates hosted and OAuth redirects with one-time state', () => {
    const anonKey = projectToken('11111111-1111-1111-1111-111111111111');
    const volcano = createVolcanoClient({
      anonKey,
      baseUrl: 'https://api.test.com',
    });

    const hosted = new URL(volcano.auth.getHostedAuthUrl({ action: 'signup' }));
    const hostedState = hosted.searchParams.get('state');
    expect(hosted.pathname).toBe('/projects/11111111-1111-1111-1111-111111111111/auth/hosted');
    expect(hosted.searchParams.get('anon_key')).toBe(anonKey);
    expect(hosted.searchParams.get('action')).toBe('signup');
    expect(window.sessionStorage.getItem('volcano_auth_state')).toBe(hostedState);

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const oauth = new URL(
      volcano.auth.signInWithOAuth('github', { redirectTo: 'https://app.test/callback' }),
    );
    consoleError.mockRestore();
    const redirect = new URL(oauth.searchParams.get('redirect_url'));
    expect(oauth.pathname).toBe('/auth/oauth/github/authorize');
    expect(redirect.searchParams.get('vh_state')).toBe(
      window.sessionStorage.getItem('volcano_auth_state'),
    );
  });

  it('adopts a matching hosted redirect session and strips its tokens', async () => {
    window.sessionStorage.setItem('volcano_auth_state', 'expected-state');
    window.location.hash =
      '#access_token=redirect-access&refresh_token=redirect-refresh&state=expected-state';
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ user: { email: 'redirect@example.com', id: 'redirect-user' } }),
    );

    const volcano = createVolcanoClient({
      anonKey: 'anon-key',
      baseUrl: 'https://api.test.com',
    });
    const result = await volcano.auth.getUser();

    expect(result.user.id).toBe('redirect-user');
    expect(window.location.hash).toBe('');
    expect(localStorage.store.volcano_access_token).toBe('redirect-access');
    expect(new Headers(global.fetch.mock.calls[0][1].headers).get('Authorization')).toBe(
      'Bearer redirect-access',
    );
  });

  it('rejects an unsolicited hosted redirect session', () => {
    window.location.hash = '#access_token=attacker-token&state=attacker-state';

    createVolcanoClient({ anonKey: 'anon-key' });

    expect(localStorage.store.volcano_access_token).toBeUndefined();
    expect(window.location.hash).toBe('');
  });
});
