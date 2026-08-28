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

  test('authentication facade methods delegate through the generated transport', async () => {
    const user = {
      id: 'user-auth',
      email: 'auth@example.com',
      created_at: '2026-08-28T12:00:00Z',
      updated_at: '2026-08-28T12:00:00Z',
    };
    const session = {
      access_token: 'access-auth',
      refresh_token: 'refresh-auth',
      expires_in: 3600,
    };
    const success = (data, status = 200) => jest.fn().mockResolvedValue({ data, status });
    const transport = {
      authSignup: success({ confirmation_required: false, message: 'Check your email' }, 201),
      authSignin: success({ user, ...session }),
      authLogout: success(undefined, 204),
      authGetUser: success({ user }),
      authUpdateUser: success({ user }),
      authRefresh: success({ user, ...session }),
      authSignupAnonymous: success({ user, ...session }, 201),
      authConvertAnonymous: success({ user }),
      authConfirmEmail: success({ message: 'Email confirmed' }),
      authResendConfirmation: success({ message: 'Confirmation sent' }),
      authForgotPassword: success({ message: 'Reset sent' }),
      authResetPassword: success({ message: 'Password reset' }),
      authRequestEmailChange: success({
        message: 'Email change requested',
        new_email: 'next@example.com',
        email_change_token: 'email-change-token',
      }),
      authConfirmEmailChange: success({ user }),
      authCancelEmailChange: success({ message: 'Email change cancelled' }),
      authLinkOAuthProvider: success({ authorization_url: 'https://provider.test/authorize' }),
      authUnlinkOAuthProvider: success(undefined, 204),
      authListOAuthProviders: success({ providers: [] }),
      refreshOAuthProviderToken: success({
        message: 'Token refreshed',
        provider: 'github',
        expires_in: 3600,
      }),
      getOAuthProviderToken: success({
        message: 'Token available',
        provider: 'github',
        expires_in: 3600,
      }),
      callOAuthProviderAPI: success({ data: { login: 'volcano' } }),
      authGetMySessions: success({
        sessions: [],
        total: 0,
        page: 2,
        limit: 10,
        total_pages: 0,
      }),
      authDeleteMySession: success(undefined, 204),
      authDeleteAllMySessions: success(undefined, 204),
    };
    const volcano = new VolcanoClient({
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-contract',
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      transportFactory: () => transport,
    });

    await volcano.auth.signUp({
      email: user.email,
      password: 'password',
      metadata: { role: 'dev' },
    });
    await volcano.auth.signIn({ email: user.email, password: 'password' });
    await volcano.auth.getUser();
    await volcano.auth.updateUser({ password: 'new-password', metadata: { role: 'admin' } });
    await volcano.auth.refreshSession();
    await volcano.auth.signUpAnonymous({ source: 'contract' });
    await volcano.auth.convertAnonymous({ email: user.email, password: 'password' });
    await volcano.auth.confirmEmail('confirmation-token');
    await volcano.auth.resendConfirmation(user.email);
    await volcano.auth.forgotPassword(user.email);
    await volcano.auth.resetPassword({ token: 'reset-token', newPassword: 'new-password' });
    await volcano.auth.requestEmailChange('next@example.com');
    await volcano.auth.confirmEmailChange('email-change-token');
    await volcano.auth.cancelEmailChange();
    await volcano.auth.linkOAuthProvider('github');
    await volcano.auth.unlinkOAuthProvider('github');
    await volcano.auth.getLinkedOAuthProviders();
    await volcano.auth.refreshOAuthToken('github');
    await volcano.auth.getOAuthProviderToken('github');
    await volcano.auth.callOAuthAPI('github', {
      endpoint: '/user',
      method: 'POST',
      body: { visibility: 'private' },
    });
    await volcano.auth.getSessions({ page: 2, limit: 10 });
    await volcano.auth.deleteSession('session/other');
    await volcano.auth.deleteAllOtherSessions();
    await volcano.auth.signOut();

    for (const operation of Object.values(transport)) {
      expect(operation).toHaveBeenCalledTimes(1);
    }
    expect(transport.authSignup).toHaveBeenCalledWith(
      { email: user.email, password: 'password', user_metadata: { role: 'dev' } },
      expect.objectContaining({ volcanoAuthorization: 'anon', volcanoClient: volcano }),
    );
    expect(transport.authUpdateUser).toHaveBeenCalledWith(
      { password: 'new-password', user_metadata: { role: 'admin' } },
      expect.objectContaining({ volcanoAuthorization: 'session', volcanoClient: volcano }),
    );
    expect(transport.authGetMySessions).toHaveBeenCalledWith(
      { page: 2, limit: 10 },
      expect.objectContaining({ volcanoAuthorization: 'session', volcanoClient: volcano }),
    );
    expect(transport.authDeleteMySession).toHaveBeenCalledWith(
      'session%2Fother',
      expect.objectContaining({ volcanoAuthorization: 'session', volcanoClient: volcano }),
    );
  });

  test('OAuth callback exchange delegates through the generated transport', async () => {
    const user = { id: 'oauth-user', email: 'oauth@example.com' };
    const session = {
      access_token: 'oauth-access',
      refresh_token: 'oauth-refresh',
      expires_in: 3600,
    };
    const transport = {
      authOAuthExchange: jest.fn().mockResolvedValue({ data: { user, ...session }, status: 200 }),
      authGetUser: jest.fn().mockResolvedValue({ data: { user }, status: 200 }),
    };
    window.sessionStorage.setItem('volcano_auth_state', 'oauth-state');
    window.sessionStorage.setItem(
      'volcano_auth_redirect_url',
      `${window.location.origin}/auth/callback`,
    );
    window.history.replaceState(null, '', '/auth/callback?code=oauth-code&state=oauth-state');

    try {
      const volcano = new VolcanoClient({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-contract',
        transportFactory: () => transport,
      });

      await expect(volcano.initialize()).resolves.toMatchObject({ user, error: null });
      expect(transport.authOAuthExchange).toHaveBeenCalledWith(
        { code: 'oauth-code', redirect_url: `${window.location.origin}/auth/callback` },
        expect.objectContaining({ volcanoAuthorization: 'anon', volcanoClient: volcano }),
      );
    } finally {
      window.history.replaceState(null, '', '/');
      window.sessionStorage.clear();
    }
  });
});
