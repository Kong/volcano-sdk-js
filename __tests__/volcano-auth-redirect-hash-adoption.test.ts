/** @jest-environment ./__tests__/browser-environment.cjs */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { expectInstanceOf } from './support/assertions.ts';
import { NONCE, resetRedirectState, seedNonce } from './support/volcano-auth-redirect-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

function adoptsSessionsAtConstruction(): void {
  it.each(['', 42])('uses stored credentials when an explicit token is %p', (accessToken) => {
    window.localStorage.setItem('volcano_access_token', 'stored-access');
    window.localStorage.setItem('volcano_refresh_token', 'stored-refresh');
    const sdk: unknown = Reflect.construct(VolcanoAuth, [{ anonKey: 'ak-test-key', accessToken }]);
    expectInstanceOf(sdk, VolcanoAuth);

    expect(sdk.accessToken).toBe('stored-access');
    expect(sdk.refreshToken).toBe('stored-refresh');
  });

  it('adopts the session from the URL fragment at construction, persists it, and strips the hash', () => {
    seedNonce();
    window.location.hash = `#access_token=hash-access&refresh_token=hash-refresh&token_type=bearer&expires_in=3600&state=${NONCE}`;
    const replaceSpy = jest.spyOn(window.history, 'replaceState');

    // Construction alone must establish the session (no getUser needed).
    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

    expect(v.accessToken).toBe('hash-access');
    expect(v.refreshToken).toBe('hash-refresh');
    expect(localStorage.getItem('volcano_access_token')).toBe('hash-access');
    expect(localStorage.getItem('volcano_refresh_token')).toBe('hash-refresh');
    // Tokens were removed from the URL immediately.
    expect(replaceSpy).toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    // The one-time nonce was consumed.
    expect(window.sessionStorage.getItem('volcano_auth_state')).toBeNull();
    replaceSpy.mockRestore();
  });
}

function authenticatesWithAdoptedSessions(): void {
  it('lets an authenticated request use the adopted session without calling getUser() first', async () => {
    seedNonce();
    window.location.hash = `#access_token=hash-access&refresh_token=hash-refresh&token_type=bearer&expires_in=3600&state=${NONCE}`;
    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

    // No getUser() call — go straight to an authenticated operation.
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        user: { id: 'user-redirect', email: 'r@example.com', status: 'active' },
      }),
    );
    const result = await v.auth.updateUser({ metadata: { ok: true } });

    expect(result.error).toBeNull();
    expect(result.user?.id).toBe('user-redirect');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/user'),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: 'Bearer hash-access' }),
      }),
    );
  });
}

function adoptsLateFragments(): void {
  it('falls back to adopting the session on getUser() when the URL changes after construction', async () => {
    // Nonce was stored before navigating to the hosted page; it persists in
    // sessionStorage across the redirect back.
    seedNonce();
    // Client constructed before the redirect fragment exists.
    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    expect(v.accessToken).toBeFalsy();

    const callback = jest.fn();
    v.auth.onAuthStateChange(callback);
    // ignore any initial emission on subscribe
    callback.mockClear();

    // Fragment appears later (e.g. SPA navigation back from the hosted page).
    window.location.hash = `#access_token=late-access&refresh_token=late-refresh&token_type=bearer&expires_in=3600&state=${NONCE}`;

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        user: { id: 'user-late', email: 'fixture@example.com', status: 'active' },
      }),
    );

    const result = await v.auth.getUser();
    expect(result.user?.id).toBe('user-late');
    expect(v.accessToken).toBe('late-access');
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-late' }));
  });
}

function announcesConstructionAdoption(): void {
  it('fires onAuthStateChange once on the first getUser() after construction-time adoption', async () => {
    seedNonce();
    // Fragment present at load → the session is adopted in the constructor,
    // before any listener can subscribe (the common SPA hosted-redirect path).
    window.location.hash = `#access_token=ctor-access&refresh_token=ctor-refresh&token_type=bearer&expires_in=3600&state=${NONCE}`;
    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    expect(v.accessToken).toBe('ctor-access');

    const callback = jest.fn();
    v.auth.onAuthStateChange(callback);
    // Immediate emission on subscribe reflects the not-yet-fetched user.
    expect(callback).toHaveBeenLastCalledWith(null);
    callback.mockClear();

    fetchMock.mockImplementation(() =>
      Promise.resolve(reply(200, { user: { id: 'user-ctor', email: 'c@example.com', status: 'active' } })),
    );

    // First getUser() announces the SIGNED_IN transition for the adoption that
    // happened at construction.
    await v.auth.getUser();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-ctor' }));

    // Subsequent getUser() calls must not re-fire the adoption callback.
    await v.auth.getUser();
    expect(callback).toHaveBeenCalledTimes(1);
  });
}

describe('VolcanoAuth', () => {
  describe('Authentication - managed auth redirect (URL hash adoption)', () => {
    // These run under jsdom, so drive the real window/location/history.
    afterEach(resetRedirectState);

    adoptsSessionsAtConstruction();
    authenticatesWithAdoptedSessions();
    adoptsLateFragments();
    announcesConstructionAdoption();
  });
});
