/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { sessionToken } from './session-fixtures.ts';
import { installWindow, restoreWindow } from './support/volcano-auth-sessions-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const newPassword = 'fake-new-password';
let volcano: VolcanoAuth;

beforeEach(() => {
  installWindow({ document: {}, localStorage });
  volcano = new VolcanoAuth(config);
});

afterEach(restoreWindow);

function updatesUsers(): void {
  it('should update user password', async () => {
    volcano.accessToken = 'valid-token';

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        user: { id: 'user-123', email: 'test@example.com', status: 'active' },
      }),
    );

    const result = await volcano.auth.updateUser({ password: 'newPassword123' });

    expect(result.user?.id).toBe('user-123');
    expect(result.error).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/user'),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('should update user metadata', async () => {
    volcano.accessToken = 'valid-token';

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        user: { id: 'user-123', metadata: { name: 'John' }, email: 'fixture@example.com', status: 'active' },
      }),
    );

    const result = await volcano.auth.updateUser({ metadata: { name: 'John' } });

    expect(result.user).toMatchObject({ metadata: { name: 'John' } });
    expect(result.error).toBeNull();
  });
}

function rejectsFailedUserUpdates(): void {
  it('should return error when not authenticated', async () => {
    volcano.accessToken = null;

    const result = await volcano.auth.updateUser({ password: 'newpass' });

    expect(result.user).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('should return error on failure', async () => {
    volcano.accessToken = 'valid-token';

    fetchMock.mockResolvedValueOnce(reply(400, { error: 'Password too weak' }));

    const result = await volcano.auth.updateUser({ password: '123' });

    expect(result.user).toBeNull();
    expect(result.error?.message).toBe('Password too weak');
  });
}

function leavesUpdateValidationToBackend(): void {
  it('should pass empty params to backend (backend validates)', async () => {
    volcano.accessToken = sessionToken();

    // Mock backend returning validation error
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'At least one of password or metadata is required' }));

    const result = await volcano.auth.updateUser({});

    // SDK passes request to backend, backend returns error
    expect(result.user).toBeNull();
    expect(result.error).toBeDefined();
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should allow update with password only', async () => {
    volcano.accessToken = sessionToken();

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        user: { id: 'user-123', email: 'fixture@example.com', status: 'active' },
      }),
    );

    const result = await volcano.auth.updateUser({ password: newPassword });

    expect(result.error).toBeNull();
    expect(result.user).toBeDefined();
  });
}

function acceptsPartialUserUpdates(): void {
  it('should allow update with metadata only', async () => {
    volcano.accessToken = sessionToken();

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        user: { id: 'user-123', email: 'fixture@example.com', status: 'active' },
      }),
    );

    const result = await volcano.auth.updateUser({ metadata: { name: 'Test' } });

    expect(result.error).toBeNull();
    expect(result.user).toBeDefined();
  });

  it('should allow update with both password and metadata', async () => {
    volcano.accessToken = sessionToken();

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        user: { id: 'user-123', email: 'fixture@example.com', status: 'active' },
      }),
    );

    const result = await volcano.auth.updateUser({
      password: newPassword,
      metadata: { name: 'Test' },
    });

    expect(result.error).toBeNull();
    expect(result.user).toBeDefined();
  });
}

describe('VolcanoAuth session lifecycle', () => {
  describe('Authentication - updateUser', () => {
    updatesUsers();
    rejectsFailedUserUpdates();
  });

  describe('Security - updateUser Validation', () => {
    // SDK no longer validates params - backend handles validation
    leavesUpdateValidationToBackend();
    acceptsPartialUserUpdates();
  });
});
