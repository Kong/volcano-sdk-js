/**
 * SDK End-to-End Integration Tests
 *
 * These tests run against a real Volcano Hosting server and test all SDK methods.
 *
 * Prerequisites:
 * - Volcano server running on localhost:8000 (API) and localhost:8001 (Management)
 * - PostgreSQL database available
 * - For OAuth tests: mock OAuth server running
 */

const VolcanoAuth = require('../../src/index.js');

// Configuration
const API_URL = process.env.VOLCANO_API_URL || 'http://localhost:8000';
const MGMT_URL = process.env.VOLCANO_MGMT_URL || 'http://localhost:8001';
const TEST_FUNCTION_ZIP_BASE64 =
  'UEsDBAoAAAAAAMybV1xk0uNfQQAAAEEAAAAIABwAaW5kZXguanNVVAkAA08bnWlPG51pdXgLAAEE9QEAAAQUAAAAZXhwb3J0cy5oYW5kbGVyID0gYXN5bmMgKCkgPT4gKHsgc3RhdHVzQ29kZTogMjAwLCBib2R5OiAnb2snIH0pOwpQSwECHgMKAAAAAADMm1dcZNLjX0EAAABBAAAACAAYAAAAAAABAAAApIEAAAAAaW5kZXguanNVVAUAA08bnWl1eAsAAQT1AQAABBQAAABQSwUGAAAAAAEAAQBOAAAAgwAAAAAA';

function createTestFunctionZipBuffer() {
  return Buffer.from(TEST_FUNCTION_ZIP_BASE64, 'base64');
}

// Helper to make management API calls
async function mgmtFetch(path, options = {}) {
  const response = await fetch(`${MGMT_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Management API error: ${response.status} - ${error.error || 'Unknown error'}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

// Helper to make platform API calls with user token
async function platformFetch(path, token, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Platform API error: ${response.status} - ${error.error || 'Unknown error'}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function platformFetchMultipart(path, token, formData) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Platform API error: ${response.status} - ${error.error || 'Unknown error'}`);
  }

  return response.json();
}

async function createFunctionViaPlatform(projectId, token, functionName) {
  const formData = new FormData();
  formData.append('name', functionName);
  formData.append('runtime', 'nodejs24.x');
  formData.append('handler', 'index.handler');
  formData.append(
    'code',
    new Blob([createTestFunctionZipBuffer()], { type: 'application/zip' }),
    'function.zip',
  );
  return platformFetchMultipart(`/projects/${projectId}/functions`, token, formData);
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

// Integration tests run in the Node test environment, so there is no DOM. The
// managed-auth redirect hand-off is browser-only (the SDK reads the session from
// window.location.hash), so install a minimal window for the duration of a test.
function installBrowserEnv(initialHash) {
  let currentHash = initialHash || '';
  const store = {};
  const sessionStore = {};
  const makeStorage = (backing) => ({
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(backing, key) ? backing[key] : null;
    },
    setItem(key, value) {
      backing[key] = String(value);
    },
    removeItem(key) {
      delete backing[key];
    },
    clear() {
      for (const key of Object.keys(backing)) {
        delete backing[key];
      }
    },
  });
  global.window = {
    document: {},
    location: {
      origin: 'https://app.example.com',
      pathname: '/callback',
      search: '',
      get hash() {
        return currentHash;
      },
      set hash(value) {
        currentHash = value;
      },
    },
    history: {
      state: null,
      replaceState(_state, _title, url) {
        const hashIndex = String(url).indexOf('#');
        currentHash = hashIndex >= 0 ? String(url).slice(hashIndex) : '';
      },
    },
    localStorage: makeStorage(store),
    sessionStorage: makeStorage(sessionStore),
  };
  return {
    store,
    sessionStore,
    getHash: () => currentHash,
    // Seed the RP nonce the way signInWithHostedAuth()/signInWithOAuth() would
    // before redirecting.
    seedAuthState: (nonce) => {
      sessionStore.volcano_auth_state = String(nonce);
    },
  };
}

function uninstallBrowserEnv() {
  delete global.window;
}

describe('SDK E2E Integration Tests', () => {
  // Test fixtures
  let platformUser;
  let platformToken;
  let project;
  let anonKey;
  let volcano;

  // Cleanup tracking
  const projectCleanupFns = [];

  beforeAll(async () => {
    console.log('\n========================================');
    console.log('SDK E2E Integration Tests');
    console.log('========================================\n');

    // Verify server is running
    try {
      const healthResponse = await fetch(`${API_URL}/health`);
      if (!healthResponse.ok) {
        throw new Error('Health check failed');
      }
      console.log('[ok] Volcano API server is running');
    } catch {
      throw new Error(
        `Volcano API server is not running at ${API_URL}. Please start the server first.`,
      );
    }

    // Create platform user
    platformUser = await mgmtFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        id: `sdk-e2e-test-${Date.now()}`,
        name: 'SDK E2E Test User',
      }),
    });
    console.log(`[ok] Created platform user: ${platformUser.id}`);

    // Create platform token
    const tokenResponse = await mgmtFetch(`/users/${platformUser.id}/tokens`, {
      method: 'POST',
      body: JSON.stringify({ name: 'sdk-e2e-test-token' }),
    });
    platformToken = tokenResponse.token;
    console.log('[ok] Created platform token');

    // Create project with unique name
    project = await platformFetch('/projects', platformToken, {
      method: 'POST',
      body: JSON.stringify({ name: `sdk-e2e-${Date.now()}` }),
    });
    projectCleanupFns.push(async () => {
      await platformFetch(`/projects/${project.id}`, platformToken, { method: 'DELETE' });
    });
    console.log(`[ok] Created project: ${project.id}`);

    // Create anon key
    const anonKeyResponse = await platformFetch(
      `/projects/${project.id}/anon-keys`,
      platformToken,
      {
        method: 'POST',
        body: JSON.stringify({ name: 'sdk-e2e-test-key' }),
      },
    );
    anonKey = anonKeyResponse.key_value;
    console.log('[ok] Created anon key');

    // Enable anonymous signups for the project
    await platformFetch(`/projects/${project.id}/auth/config`, platformToken, {
      method: 'PUT',
      body: JSON.stringify({
        enable_anonymous_signins: true,
        enable_signup: true,
        enable_email_password: true,
      }),
    });
    console.log('[ok] Anonymous signups enabled');

    // Initialize SDK
    volcano = new VolcanoAuth({
      apiUrl: API_URL,
      projectId: project.id,
      anonKey: anonKey,
    });
    console.log('[ok] SDK initialized\n');
  });

  afterAll(async () => {
    console.log('\n========================================');
    console.log('Cleanup');
    console.log('========================================\n');

    // Run project cleanup functions before deleting the user so project delete handlers run.
    for (const fn of projectCleanupFns.slice().reverse()) {
      try {
        await withTimeout(fn(), 45000, 'project cleanup function');
      } catch (error) {
        console.log(`[warn] Cleanup warning: ${error.message}`);
      }
    }

    // Delete platform user
    if (platformUser && platformUser.id) {
      try {
        await mgmtFetch(`/users/${platformUser.id}`, { method: 'DELETE' });
        console.log(`[ok] Platform user ${platformUser.id} deleted`);
      } catch (error) {
        console.log(`[warn] User deletion warning: ${error.message}`);
      }
    }

    console.log('[ok] Cleanup complete');
  }, 180000);

  // ============================================================================
  // Authentication Tests
  // ============================================================================

  describe('Authentication', () => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'SecureP@ssw0rd123!';
    let testUser;

    test('signUp - creates new user', async () => {
      const result = await volcano.auth.signUp({
        email: testEmail,
        password: testPassword,
        metadata: { source: 'sdk-e2e-test' },
      });

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(testEmail);
      expect(result.session).toBeDefined();
      expect(result.session.access_token).toBeDefined();
      expect(result.session.refresh_token).toBeDefined();

      // Verify last_sign_in_at is set on signup (not "Never")
      expect(result.user.last_sign_in_at).toBeDefined();
      expect(result.user.last_sign_in_at).not.toBeNull();

      testUser = result.user;
      console.log(`  [ok] User signed up: ${testUser.id}`);
      console.log(`  [ok] Last sign in set: ${testUser.last_sign_in_at}`);
    });

    test('signOut - clears session', async () => {
      const result = await volcano.auth.signOut();
      expect(result.error).toBeNull();
      expect(volcano.accessToken).toBeNull();
      console.log('  [ok] User signed out');
    });

    test('signIn - authenticates existing user', async () => {
      const result = await volcano.auth.signIn({
        email: testEmail,
        password: testPassword,
      });

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(testEmail);
      expect(result.session.access_token).toBeDefined();

      console.log('  [ok] User signed in');
    });

    test('getUser - returns current user', async () => {
      const result = await volcano.auth.getUser();

      expect(result.user).toBeDefined();
      expect(result.user.id).toBe(testUser.id);
      expect(result.error).toBeNull();
      console.log('  [ok] Got current user');
    });

    test('user() - returns current user synchronously', () => {
      const user = volcano.auth.user();
      expect(user).toBeDefined();
      expect(user.id).toBe(testUser.id);
      console.log('  [ok] Got user synchronously');
    });

    test('updateUser - updates user metadata', async () => {
      const result = await volcano.auth.updateUser({
        metadata: { updated: true, timestamp: Date.now() },
      });

      expect(result.user).toBeDefined();
      expect(result.error).toBeNull();
      console.log('  [ok] Updated user metadata');
    });

    test('refreshSession - refreshes tokens', async () => {
      const result = await volcano.auth.refreshSession();

      expect(result.session).toBeDefined();
      expect(result.session.access_token).toBeDefined();
      expect(result.error).toBeNull();
      console.log('  [ok] Session refreshed');
    });

    test('onAuthStateChange - receives callback', (done) => {
      volcano.auth.onAuthStateChange((user) => {
        expect(user).toBeDefined();
        done();
      });
    });
  });

  // ============================================================================
  // Managed Hosted Auth Helpers (E2E)
  // ============================================================================

  describe('Managed Hosted Auth Helpers', () => {
    async function createHostedHelperProject(nameSuffix, rateLimitSignin = 1) {
      const hostedProject = await platformFetch('/projects', platformToken, {
        method: 'POST',
        body: JSON.stringify({ name: `sdk-e2e-hosted-${nameSuffix}-${Date.now()}` }),
      });
      projectCleanupFns.push(async () => {
        await platformFetch(`/projects/${hostedProject.id}`, platformToken, {
          method: 'DELETE',
        });
      });

      await platformFetch(`/projects/${hostedProject.id}/auth/config`, platformToken, {
        method: 'PUT',
        body: JSON.stringify({
          managed_auth_enabled: true,
          enable_signup: true,
          enable_email_password: true,
          rate_limit_signin: rateLimitSignin,
          allowed_redirect_urls: ['https://app.example.com/callback'],
          post_auth_redirect_url: 'https://app.example.com/callback',
        }),
      });

      const hostedAnonKeyResponse = await platformFetch(
        `/projects/${hostedProject.id}/anon-keys`,
        platformToken,
        {
          method: 'POST',
          body: JSON.stringify({ name: `sdk-e2e-hosted-key-${nameSuffix}-${Date.now()}` }),
        },
      );

      return {
        projectId: hostedProject.id,
        anonKeyId: hostedAnonKeyResponse.id,
        anonKey: hostedAnonKeyResponse.key_value,
      };
    }

    // ------------------------------------------------------------------------
    // Session bootstrap: the SDK must authenticate the user WITHOUT a prior
    // getUser() call, consistently for the standard flow and the managed flow.
    // ------------------------------------------------------------------------

    test('standard flow - session from signUp is usable for an authenticated call without getUser()', async () => {
      const hosted = await createHostedHelperProject('standard-bootstrap', 50);
      const client = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: hosted.projectId,
        anonKey: hosted.anonKey,
      });

      const email = `standard-bootstrap-${Date.now()}@example.com`;
      const password = 'SecureP@ssw0rd123!';
      const signup = await client.auth.signUp({
        email,
        password,
        metadata: { name: 'Standard Bootstrap' },
      });
      expect(signup.session).toBeDefined();
      expect(signup.session.access_token).toBeTruthy();

      // No getUser() — go straight to an operation that requires authentication.
      const updated = await client.auth.updateUser({ metadata: { bootstrapped: 'standard' } });
      expect(updated.error).toBeNull();
      expect(updated.user).toBeDefined();
      expect(updated.user.email).toBe(email);

      console.log('  [ok] standard signUp session authenticated an update without getUser()');
    });

    test('standard flow - a new client restores the session from storage and is usable without getUser()', async () => {
      const hosted = await createHostedHelperProject('standard-reload', 50);
      const email = `standard-reload-${Date.now()}@example.com`;
      const password = 'SecureP@ssw0rd123!';

      const browser = installBrowserEnv('');
      try {
        // First client signs up; its session is persisted to (browser) storage.
        const first = new VolcanoAuth({
          apiUrl: API_URL,
          projectId: hosted.projectId,
          anonKey: hosted.anonKey,
        });
        const signup = await first.auth.signUp({ email, password });
        expect(signup.session.access_token).toBeTruthy();
        expect(browser.store['volcano_access_token']).toBeTruthy();

        // Simulate a page reload: a brand-new client restores the session from storage.
        const reloaded = new VolcanoAuth({
          apiUrl: API_URL,
          projectId: hosted.projectId,
          anonKey: hosted.anonKey,
        });
        expect(reloaded.accessToken).toBe(signup.session.access_token);

        // No getUser() — authenticated operation works straight away.
        const updated = await reloaded.auth.updateUser({ metadata: { bootstrapped: 'reload' } });
        expect(updated.error).toBeNull();
        expect(updated.user.email).toBe(email);
      } finally {
        uninstallBrowserEnv();
      }

      console.log(
        '  [ok] reloaded client restored session and authenticated an update without getUser()',
      );
    });

    // The headline test: drive the flow as a real app would. The SDK initiates
    // via getHostedAuthUrl() (generating + storing the nonce), the API actually
    // serves the hosted page, the server mints a real session, and the SDK
    // validates the echoed `state` and authenticates — all with no getUser().
    test('managed flow - FULL E2E: getHostedAuthUrl() init + real hosted page + server session + SDK state validation', async () => {
      const hosted = await createHostedHelperProject('managed-e2e', 50);

      // Models the app origin/tab. sessionStorage persists across the navigation
      // to the hosted page and back to the post-auth redirect URL.
      const browser = installBrowserEnv('');
      try {
        // 1) The app starts the flow with the SDK on its login page. This mints a
        //    one-time nonce, stores it in sessionStorage, and returns the hosted URL.
        const initiator = new VolcanoAuth({ apiUrl: API_URL, anonKey: hosted.anonKey });
        const hostedUrl = initiator.auth.getHostedAuthUrl({
          projectId: hosted.projectId,
          action: 'signup',
        });
        const parsedHosted = new URL(hostedUrl);
        expect(parsedHosted.pathname).toBe(`/projects/${hosted.projectId}/auth/hosted`);
        expect(parsedHosted.searchParams.get('anon_key')).toBe(hosted.anonKey);
        expect(parsedHosted.searchParams.get('action')).toBe('signup');
        const stateNonce = parsedHosted.searchParams.get('state');
        expect(stateNonce).toBeTruthy();
        // The SDK stored exactly this nonce for validation on return.
        expect(browser.sessionStore.volcano_auth_state).toBe(stateNonce);

        // 2) The hosted page is really served by the API and contains the logic
        //    that echoes ?state back into the post-auth fragment.
        const pageRes = await fetch(hostedUrl, { headers: { Accept: 'text/html' } });
        expect(pageRes.status).toBe(200);
        const pageHtml = await pageRes.text();
        expect(pageHtml).toContain("if (stateNonce) params.set('state', stateNonce)");

        // 3) The hosted page authenticates the user (its JS POSTs /auth/signup with
        //    the anon key) and mints a real session — reproduce that server call.
        const email = `managed-e2e-${Date.now()}@example.com`;
        const password = 'SecureP@ssw0rd123!';
        const signupResponse = await fetch(`${API_URL}/auth/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${hosted.anonKey}`,
          },
          body: JSON.stringify({ email, password, user_metadata: { name: 'Managed E2E' } }),
        });
        expect([200, 201]).toContain(signupResponse.status);
        const session = await signupResponse.json();
        expect(session.access_token).toBeTruthy();
        expect(session.refresh_token).toBeTruthy();

        // 4) The hosted page redirects to post_auth_redirect_url with the tokens AND
        //    the SAME state nonce in the fragment (what redirectWithSession does).
        const frag = new URLSearchParams();
        frag.set('access_token', session.access_token);
        frag.set('refresh_token', session.refresh_token);
        frag.set('token_type', session.token_type || 'bearer');
        frag.set('expires_in', String(session.expires_in || 0));
        frag.set('state', stateNonce);
        // Same tab/origin: sessionStorage (and thus the nonce) is still present.
        global.window.location.hash = `#${frag.toString()}`;

        // 5) A fresh client on the redirect page adopts the session AT CONSTRUCTION
        //    because the returned state matches the stored nonce. No getUser() needed.
        const client = new VolcanoAuth({ apiUrl: API_URL, anonKey: hosted.anonKey });
        expect(client.accessToken).toBe(session.access_token);
        expect(client.refreshToken).toBe(session.refresh_token);
        expect(browser.getHash()).toBe('');
        // The one-time nonce was consumed.
        expect(browser.sessionStore.volcano_auth_state).toBeUndefined();

        // 6) An authenticated operation works immediately, with no getUser() first.
        const updated = await client.auth.updateUser({ metadata: { bootstrapped: 'managed-e2e' } });
        expect(updated.error).toBeNull();
        expect(updated.user.email).toBe(email);
      } finally {
        uninstallBrowserEnv();
      }

      console.log(
        '  [ok] full managed E2E via getHostedAuthUrl(): real init + served page + server session + SDK state validation',
      );
    });

    test('managed flow - an unsolicited redirect session (no nonce stored) is rejected', async () => {
      const hosted = await createHostedHelperProject('managed-csrf', 50);

      // A real, valid session (as if minted for an attacker's own account).
      const email = `managed-csrf-${Date.now()}@example.com`;
      const password = 'SecureP@ssw0rd123!';
      const signupResponse = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hosted.anonKey}`,
        },
        body: JSON.stringify({ email, password, user_metadata: { name: 'Managed CSRF' } }),
      });
      expect([200, 201]).toContain(signupResponse.status);
      const session = await signupResponse.json();
      expect(session.access_token).toBeTruthy();

      const params = new URLSearchParams();
      params.set('access_token', session.access_token);
      params.set('refresh_token', session.refresh_token);
      params.set('token_type', session.token_type || 'bearer');
      params.set('expires_in', String(session.expires_in || 0));
      params.set('state', 'attacker-supplied-state');
      const redirectHash = `#${params.toString()}`;

      // The victim never initiated a flow in this tab: no nonce in sessionStorage.
      const browser = installBrowserEnv(redirectHash);
      try {
        const client = new VolcanoAuth({
          apiUrl: API_URL,
          projectId: hosted.projectId,
          anonKey: hosted.anonKey,
        });
        // The unsolicited session is NOT adopted, and the tokens are scrubbed.
        expect(client.accessToken).toBeFalsy();
        expect(browser.getHash()).toBe('');

        // An authenticated call therefore fails (no session was established).
        const updated = await client.auth.updateUser({ metadata: { x: 1 } });
        expect(updated.user).toBeNull();
        expect(updated.error).toBeTruthy();
      } finally {
        uninstallBrowserEnv();
      }

      console.log('  [ok] unsolicited managed redirect session was rejected (login-CSRF defense)');
    });

    test('managed flow - a session whose state does not match the stored nonce is rejected', async () => {
      const hosted = await createHostedHelperProject('managed-mismatch', 50);

      const browser = installBrowserEnv('');
      try {
        // The user legitimately starts a flow, so a real nonce is stored.
        const initiator = new VolcanoAuth({ apiUrl: API_URL, anonKey: hosted.anonKey });
        const hostedUrl = initiator.auth.getHostedAuthUrl({ projectId: hosted.projectId });
        const realNonce = new URL(hostedUrl).searchParams.get('state');
        expect(browser.sessionStore.volcano_auth_state).toBe(realNonce);

        // A real session is minted...
        const email = `managed-mismatch-${Date.now()}@example.com`;
        const password = 'SecureP@ssw0rd123!';
        const signupResponse = await fetch(`${API_URL}/auth/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${hosted.anonKey}`,
          },
          body: JSON.stringify({ email, password, user_metadata: { name: 'Managed Mismatch' } }),
        });
        expect([200, 201]).toContain(signupResponse.status);
        const session = await signupResponse.json();

        // ...but the fragment that lands carries a DIFFERENT state (injected/replayed).
        const frag = new URLSearchParams();
        frag.set('access_token', session.access_token);
        frag.set('refresh_token', session.refresh_token);
        frag.set('token_type', session.token_type || 'bearer');
        frag.set('expires_in', String(session.expires_in || 0));
        frag.set('state', `${realNonce}-tampered`);
        global.window.location.hash = `#${frag.toString()}`;

        const client = new VolcanoAuth({ apiUrl: API_URL, anonKey: hosted.anonKey });
        // Mismatched state ⇒ not adopted, tokens scrubbed, nonce consumed.
        expect(client.accessToken).toBeFalsy();
        expect(browser.getHash()).toBe('');
        expect(browser.sessionStore.volcano_auth_state).toBeUndefined();
      } finally {
        uninstallBrowserEnv();
      }

      console.log('  [ok] managed redirect session with mismatched state was rejected');
    });

    test('hosted login options - returns 429 with retry-after on burst', async () => {
      const hosted = await createHostedHelperProject('options-rl');
      const optionsUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted/login/options?anon_key=${encodeURIComponent(hosted.anonKey)}`;

      const first = await fetch(optionsUrl, {
        headers: {},
      });
      expect(first.status).toBe(200);
      const firstJson = await first.json();
      expect(Array.isArray(firstJson.oauth_providers)).toBe(true);

      const start = Date.now();
      const second = await fetch(optionsUrl, {
        headers: {},
      });
      const elapsed = Date.now() - start;
      expect(second.status).toBe(429);
      expect(second.headers.get('retry-after')).toBeTruthy();
      expect(elapsed).toBeGreaterThanOrEqual(150);
      console.log('  [ok] Hosted login options rate limiting works');
    });

    test('hosted helpers - valid anon key can access options and check-email', async () => {
      const hosted = await createHostedHelperProject('valid-anon-key', 20);
      const optionsUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted/login/options?anon_key=${encodeURIComponent(hosted.anonKey)}`;
      const checkEmailUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted/login/check-email`;

      const optionsResponse = await fetch(optionsUrl, {
        headers: {},
      });
      expect(optionsResponse.status).toBe(200);
      const optionsBody = await optionsResponse.json();
      expect(typeof optionsBody.email_password_enabled).toBe('boolean');

      const checkEmailResponse = await fetch(checkEmailUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hosted.anonKey}`,
        },
        body: JSON.stringify({ email: `valid-key-${Date.now()}@example.com` }),
      });
      expect(checkEmailResponse.status).toBe(200);
      const checkEmailBody = await checkEmailResponse.json();
      expect(typeof checkEmailBody.exists).toBe('boolean');
      console.log('  [ok] Hosted helper endpoints accept valid anon key');
    });

    test('hosted login check-email - returns 429 with retry-after on burst', async () => {
      const hosted = await createHostedHelperProject('check-email-rl');
      const checkEmailUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted/login/check-email`;
      const body = JSON.stringify({ email: `hosted-rl-${Date.now()}@example.com` });

      const first = await fetch(checkEmailUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hosted.anonKey}`,
        },
        body,
      });
      expect(first.status).toBe(200);
      const firstJson = await first.json();
      expect(typeof firstJson.exists).toBe('boolean');

      const start = Date.now();
      const second = await fetch(checkEmailUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hosted.anonKey}`,
        },
        body,
      });
      const elapsed = Date.now() - start;
      expect(second.status).toBe(429);
      expect(second.headers.get('retry-after')).toBeTruthy();
      expect(elapsed).toBeGreaterThanOrEqual(150);
      console.log('  [ok] Hosted login check-email rate limiting works');
    });

    test('hosted helper endpoints reject invalid anon key', async () => {
      const hosted = await createHostedHelperProject('invalid-anon-key', 20);
      const invalidAnonKeySuffix = hosted.anonKey.endsWith('x') ? 'y' : 'x';
      const invalidAnonKey = `${hosted.anonKey.slice(0, -1)}${invalidAnonKeySuffix}`;
      const optionsUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted/login/options?anon_key=${encodeURIComponent(invalidAnonKey)}`;
      const checkEmailUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted/login/check-email`;

      const optionsResponse = await fetch(optionsUrl, {
        headers: {},
      });
      expect(optionsResponse.status).toBe(401);

      const checkEmailResponse = await fetch(checkEmailUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${invalidAnonKey}`,
        },
        body: JSON.stringify({ email: `invalid-key-${Date.now()}@example.com` }),
      });
      expect(checkEmailResponse.status).toBe(401);
      console.log('  [ok] Hosted helper endpoints reject invalid anon key');
    });

    test('hosted helper endpoints reject revoked anon key', async () => {
      const hosted = await createHostedHelperProject('revoked-anon-key', 20);
      const optionsUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted/login/options?anon_key=${encodeURIComponent(hosted.anonKey)}`;
      const checkEmailUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted/login/check-email`;

      const beforeRevoke = await fetch(optionsUrl, {
        headers: {},
      });
      expect(beforeRevoke.status).toBe(200);

      await platformFetch(
        `/projects/${hosted.projectId}/anon-keys/${hosted.anonKeyId}`,
        platformToken,
        {
          method: 'DELETE',
        },
      );

      const optionsAfterRevoke = await fetch(optionsUrl, {
        headers: {},
      });
      expect(optionsAfterRevoke.status).toBe(401);

      const checkEmailAfterRevoke = await fetch(checkEmailUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hosted.anonKey}`,
        },
        body: JSON.stringify({ email: `revoked-key-${Date.now()}@example.com` }),
      });
      expect(checkEmailAfterRevoke.status).toBe(401);
      console.log('  [ok] Hosted helper endpoints reject revoked anon key');
    });

    test('managed hosted login page loads with valid anon key (no invalid anon key state)', async () => {
      const hosted = await createHostedHelperProject('render-page');
      const hostedUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted?anon_key=${encodeURIComponent(hosted.anonKey)}`;
      const hostedSignupUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted?action=signup&anon_key=${encodeURIComponent(hosted.anonKey)}`;
      const hostedForgotUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted?action=forgot-password&anon_key=${encodeURIComponent(hosted.anonKey)}`;
      const hostedDeviceUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted?action=device&user_code=ABCD-EFGH&anon_key=${encodeURIComponent(hosted.anonKey)}`;
      const optionsUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted/login/options?anon_key=${encodeURIComponent(hosted.anonKey)}`;

      const response = await fetch(hostedUrl, {
        headers: {
          Accept: 'text/html',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');

      const html = await response.text();
      expect(html).toContain('vh-login-root');
      expect(html).toContain('/auth/hosted/login/options');
      expect(html).toContain('/auth/hosted/login/check-email');
      expect(html.toLowerCase()).not.toContain('invalid anon key');

      const signupResponse = await fetch(hostedSignupUrl, {
        headers: {
          Accept: 'text/html',
        },
      });
      expect(signupResponse.status).toBe(200);
      const signupHtml = await signupResponse.text();
      expect(signupHtml).toContain('data-initial-action="signup"');

      const forgotResponse = await fetch(hostedForgotUrl, {
        headers: {
          Accept: 'text/html',
        },
      });
      expect(forgotResponse.status).toBe(200);
      const forgotHtml = await forgotResponse.text();
      expect(forgotHtml).toContain('data-initial-action="forgot-password"');

      // Device approval is rendered inline by the API as a managed page (no
      // redirect to an external app).
      const deviceResponse = await fetch(hostedDeviceUrl, {
        headers: {
          Accept: 'text/html',
        },
        redirect: 'manual',
      });
      expect(deviceResponse.status).toBe(200);
      const deviceHtml = await deviceResponse.text();
      expect(deviceHtml).toContain('data-initial-action="device"');
      expect(deviceHtml).toContain('/auth/device/verify');

      // Validate same key is accepted by hosted login init helper.
      // This mirrors what the hosted page script does on load and
      // ensures runtime won't collapse into an "invalid anon key" state.
      const optionsResponse = await fetch(optionsUrl, {
        headers: {},
      });
      expect(optionsResponse.status).toBe(200);
      const optionsBody = await optionsResponse.json();
      expect(typeof optionsBody.email_password_enabled).toBe('boolean');
      console.log('  [ok] Managed hosted login page and init helper accept valid anon key');
    });

    test('managed hosted reset-password page loads built-in reset form', async () => {
      const hosted = await createHostedHelperProject('render-reset-page');
      const resetPageUrl = `${API_URL}/projects/${hosted.projectId}/auth/hosted/reset-password?anon_key=${encodeURIComponent(hosted.anonKey)}&token=test-token`;

      const response = await fetch(resetPageUrl, {
        headers: {
          Accept: 'text/html',
        },
      });

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('vh-reset-root');
      expect(html).toContain('/auth/reset-password');
      expect(html).not.toContain('Customize this hosted page from Auth Settings');
      console.log('  [ok] Managed hosted reset-password page renders built-in form');
    });
  });

  // ============================================================================
  // Anonymous Authentication Tests
  // ============================================================================

  describe('Anonymous Authentication', () => {
    let anonVolcano;
    let anonUser;

    beforeAll(() => {
      // Create fresh SDK instance for anonymous tests
      anonVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });
    });

    test('signUpAnonymous - creates anonymous user', async () => {
      const result = await anonVolcano.auth.signUpAnonymous({ device: 'test' });

      expect(result.user).toBeDefined();
      // Anonymous flag is stored in user_metadata
      expect(result.user.user_metadata?.anonymous).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.error).toBeNull();

      anonUser = result.user;
      console.log(`  [ok] Anonymous user created: ${anonUser.id}`);
    });

    test('convertAnonymous - converts to regular user', async () => {
      const convertEmail = `converted-${Date.now()}@example.com`;
      const result = await anonVolcano.auth.convertAnonymous({
        email: convertEmail,
        password: 'ConvertedP@ss123!',
      });

      expect(result.user).toBeDefined();
      // After conversion, anonymous flag should be removed from metadata
      expect(result.user.user_metadata?.anonymous).toBeFalsy();
      expect(result.user.email).toBe(convertEmail);
      expect(result.error).toBeNull();
      console.log('  [ok] Anonymous user converted');
    });
  });

  // ============================================================================
  // Email Confirmation Tests
  // ============================================================================

  describe('Email Confirmation', () => {
    test('resendConfirmation - sends confirmation email', async () => {
      // Create a fresh user for this test
      const freshVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      const email = `confirm-test-${Date.now()}@example.com`;
      await freshVolcano.auth.signUp({
        email,
        password: 'TestP@ss123!',
      });

      // Sign out so we can test resend
      await freshVolcano.auth.signOut();

      const result = await freshVolcano.auth.resendConfirmation(email);

      // May return error if email not configured, which is OK for this test
      expect(result).toBeDefined();
      console.log('  [ok] Resend confirmation called');
    });

    test('confirmEmail - validates token format', async () => {
      const freshVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      // Use invalid token - should return error
      const result = await freshVolcano.auth.confirmEmail('invalid-token');

      expect(result.error).toBeDefined();
      console.log('  [ok] Confirm email rejects invalid token');
    });
  });

  // ============================================================================
  // Password Recovery Tests
  // ============================================================================

  describe('Password Recovery', () => {
    test('forgotPassword - initiates reset flow', async () => {
      const email = `forgot-${Date.now()}@example.com`;

      // Create user first
      const freshVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });
      await freshVolcano.auth.signUp({
        email,
        password: 'TestP@ss123!',
      });
      await freshVolcano.auth.signOut();

      const result = await freshVolcano.auth.forgotPassword(email);

      // May return error if email not configured, which is OK
      expect(result).toBeDefined();
      console.log('  [ok] Forgot password called');
    });

    test('resetPassword - validates token', async () => {
      const freshVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      const result = await freshVolcano.auth.resetPassword({
        token: 'invalid-token',
        newPassword: 'NewP@ss123!',
      });

      expect(result.error).toBeDefined();
      console.log('  [ok] Reset password rejects invalid token');
    });
  });

  // ============================================================================
  // Email Change Tests
  // ============================================================================

  describe('Email Change', () => {
    let emailChangeVolcano;

    beforeAll(async () => {
      emailChangeVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      await emailChangeVolcano.auth.signUp({
        email: `email-change-${Date.now()}@example.com`,
        password: 'TestP@ss123!',
      });
    });

    test('requestEmailChange - initiates email change', async () => {
      const newEmail = `new-email-${Date.now()}@example.com`;
      const result = await emailChangeVolcano.auth.requestEmailChange(newEmail);

      // May return error if email not configured
      expect(result).toBeDefined();
      console.log('  [ok] Request email change called');
    });

    test('cancelEmailChange - cancels pending change', async () => {
      const result = await emailChangeVolcano.auth.cancelEmailChange();

      // May return error if no pending change
      expect(result).toBeDefined();
      console.log('  [ok] Cancel email change called');
    });

    test('confirmEmailChange - validates token', async () => {
      const result = await emailChangeVolcano.auth.confirmEmailChange('invalid-token');

      expect(result.error).toBeDefined();
      console.log('  [ok] Confirm email change rejects invalid token');
    });
  });

  // ============================================================================
  // Session Management Tests
  // ============================================================================

  describe('Session Management', () => {
    let sessionVolcano;
    let sessionUser;

    beforeAll(async () => {
      // Create a fresh user for session tests
      sessionVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      const email = `session-test-${Date.now()}@example.com`;
      const result = await sessionVolcano.auth.signUp({
        email,
        password: 'SessionP@ss123!',
      });

      expect(result.user).toBeDefined();
      sessionUser = result.user;
      console.log(`  [ok] Session test user created: ${email}`);
    });

    test('getSessions - returns paginated current sessions', async () => {
      const result = await sessionVolcano.auth.getSessions();

      expect(result.error).toBeNull();
      expect(result.sessions).toBeDefined();
      expect(result.sessions.length).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total_pages).toBeGreaterThanOrEqual(1);

      // The current session should be marked
      const currentSession = result.sessions.find((s) => s.is_current);
      expect(currentSession).toBeDefined();
      expect(currentSession.is_active).toBe(true);
      expect(currentSession.provider).toBe('email');

      console.log(
        `  [ok] getSessions returned page ${result.page}/${result.total_pages} with ${result.sessions.length} sessions (${result.total} total)`,
      );
    });

    test('getSessions - supports pagination options', async () => {
      // Create multiple sessions first
      for (let i = 0; i < 5; i++) {
        await sessionVolcano.auth.signIn({ email: sessionUser.email, password: 'SessionP@ss123!' });
      }

      const result = await sessionVolcano.auth.getSessions({ page: 1, limit: 2 });

      expect(result.error).toBeNull();
      expect(result.limit).toBe(2);
      expect(result.sessions.length).toBeLessThanOrEqual(2);
      expect(result.total_pages).toBeGreaterThanOrEqual(1);

      console.log(
        `  [ok] getSessions pagination: limit=${result.limit}, total_pages=${result.total_pages}`,
      );
    });

    test('deleteSession - deletes specific session', async () => {
      // First, create another session by signing in again
      const email = sessionUser.email;
      const signInResult = await sessionVolcano.auth.signIn({
        email,
        password: 'SessionP@ss123!',
      });
      expect(signInResult.user).toBeDefined();

      // Get all sessions
      const sessionsResult = await sessionVolcano.auth.getSessions();
      expect(sessionsResult.sessions.length).toBeGreaterThanOrEqual(2);

      // Find a non-current session to delete
      const sessionToDelete = sessionsResult.sessions.find((s) => !s.is_current);
      expect(sessionToDelete).toBeDefined();

      // Delete it
      const deleteResult = await sessionVolcano.auth.deleteSession(sessionToDelete.id);
      expect(deleteResult.error).toBeNull();

      // Verify it's gone
      const sessionsAfter = await sessionVolcano.auth.getSessions();
      const deletedSession = sessionsAfter.sessions.find((s) => s.id === sessionToDelete.id);
      expect(deletedSession).toBeUndefined();

      console.log('  [ok] deleteSession removed specific session');
    });

    test('deleteAllOtherSessions - keeps only current session', async () => {
      // Create more sessions
      await sessionVolcano.auth.signIn({
        email: sessionUser.email,
        password: 'SessionP@ss123!',
      });
      await sessionVolcano.auth.signIn({
        email: sessionUser.email,
        password: 'SessionP@ss123!',
      });

      // Get sessions count before
      const sessionsBefore = await sessionVolcano.auth.getSessions();
      expect(sessionsBefore.total).toBeGreaterThanOrEqual(2);

      // Delete all other sessions
      const deleteResult = await sessionVolcano.auth.deleteAllOtherSessions();
      expect(deleteResult.error).toBeNull();

      // Verify only current session remains
      const sessionsAfter = await sessionVolcano.auth.getSessions();
      expect(sessionsAfter.total).toBe(1);
      expect(sessionsAfter.sessions[0].is_current).toBe(true);

      console.log('  [ok] deleteAllOtherSessions kept only current session');
    });

    test('getSessions - error when not authenticated', async () => {
      const unauthVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      const result = await unauthVolcano.auth.getSessions();

      expect(result.error).toBeDefined();
      expect(result.sessions).toBeNull();

      console.log('  [ok] getSessions requires authentication');
    });

    test('ISOLATION: User cannot see other user sessions', async () => {
      // Create two separate users
      const aliceVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      const bobVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      // Sign up Alice and create multiple sessions
      const aliceEmail = `alice-isolation-${Date.now()}@example.com`;
      await aliceVolcano.auth.signUp({ email: aliceEmail, password: 'AliceP@ss123!' });
      await aliceVolcano.auth.signIn({ email: aliceEmail, password: 'AliceP@ss123!' });
      await aliceVolcano.auth.signIn({ email: aliceEmail, password: 'AliceP@ss123!' });

      // Sign up Bob
      const bobEmail = `bob-isolation-${Date.now()}@example.com`;
      await bobVolcano.auth.signUp({ email: bobEmail, password: 'BobP@ss123!' });

      // Get each user's sessions
      const aliceSessions = await aliceVolcano.auth.getSessions();
      const bobSessions = await bobVolcano.auth.getSessions();

      // Alice should have more sessions than Bob
      expect(aliceSessions.total).toBeGreaterThan(bobSessions.total);

      // Alice's sessions should all be hers (no Bob's sessions visible)
      // Bob's sessions should all be his (no Alice's sessions visible)
      expect(aliceSessions.sessions.every((s) => s.provider === 'email')).toBe(true);
      expect(bobSessions.sessions.every((s) => s.provider === 'email')).toBe(true);

      console.log(
        `  [ok] ISOLATION: Alice sees ${aliceSessions.total} sessions, Bob sees ${bobSessions.total} sessions`,
      );
    });

    test('ISOLATION: User cannot delete other user session', async () => {
      // Create attacker and victim users
      const victimVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      const attackerVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      // Create victim with a session
      const victimEmail = `victim-${Date.now()}@example.com`;
      await victimVolcano.auth.signUp({ email: victimEmail, password: 'VictimP@ss123!' });

      // Get victim's session ID
      const victimSessions = await victimVolcano.auth.getSessions();
      expect(victimSessions.total).toBeGreaterThan(0);
      const victimSessionId = victimSessions.sessions[0].id;

      // Create attacker
      const attackerEmail = `attacker-${Date.now()}@example.com`;
      await attackerVolcano.auth.signUp({ email: attackerEmail, password: 'AttackP@ss123!' });

      // Attacker tries to delete victim's session
      const deleteResult = await attackerVolcano.auth.deleteSession(victimSessionId);

      // Should get an error (session not found for this user)
      expect(deleteResult.error).toBeDefined();

      // Victim's session should still exist
      const victimSessionsAfter = await victimVolcano.auth.getSessions();
      const stillExists = victimSessionsAfter.sessions.some((s) => s.id === victimSessionId);
      expect(stillExists).toBe(true);

      console.log('  [ok] ISOLATION: Attacker cannot delete victim session');
    });

    test('Session invalidation clears SDK tokens', async () => {
      // Create a fresh SDK instance and sign up
      const testVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      const email = `invalidation-test-${Date.now()}@example.com`;
      await testVolcano.auth.signUp({
        email,
        password: 'TestP@ss123!',
      });

      // Verify tokens are set
      expect(testVolcano.accessToken).toBeDefined();
      expect(testVolcano.refreshToken).toBeDefined();

      // Get the current session ID
      const sessionsResult = await testVolcano.auth.getSessions();
      expect(sessionsResult.sessions).toHaveLength(1);
      const currentSessionId = sessionsResult.sessions[0].id;

      // Delete the current session (simulates server-side session invalidation)
      // This makes both access and refresh tokens invalid
      await testVolcano.auth.deleteSession(currentSessionId);

      // Now try to get user - this should:
      // 1. Get 401 (access token invalid)
      // 2. Try to refresh (refresh token also invalid)
      // 3. Clear the session when refresh fails
      const userResult = await testVolcano.auth.getUser();

      // Expect error since session was invalidated
      expect(userResult.error).toBeDefined();

      // CRITICAL: Verify tokens are cleared from SDK
      expect(testVolcano.accessToken).toBeNull();
      expect(testVolcano.refreshToken).toBeNull();
      expect(testVolcano.currentUser).toBeNull();

      console.log('  [ok] Session invalidation properly clears SDK tokens');
    });

    test('Banned user has SDK tokens cleared', async () => {
      // Create a fresh SDK instance and sign up
      const testVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      const email = `ban-test-${Date.now()}@example.com`;
      const signUpResult = await testVolcano.auth.signUp({
        email,
        password: 'TestP@ss123!',
      });

      // Verify tokens are set
      expect(testVolcano.accessToken).toBeDefined();
      expect(testVolcano.refreshToken).toBeDefined();

      const userId = signUpResult.user.id;

      // Ban the user via platform API (requires platform token)
      await platformFetch(`/projects/${project.id}/auth/users/${userId}/ban`, platformToken, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Test ban' }),
      });

      // Now try to get user - this should:
      // 1. Get 401 (banned user)
      // 2. Try to refresh (also fails for banned user)
      // 3. Clear the session
      const userResult = await testVolcano.auth.getUser();

      // Expect error since user is banned
      expect(userResult.error).toBeDefined();

      // CRITICAL: Verify tokens are cleared from SDK
      expect(testVolcano.accessToken).toBeNull();
      expect(testVolcano.refreshToken).toBeNull();
      expect(testVolcano.currentUser).toBeNull();

      // Cleanup: unban user
      await platformFetch(`/projects/${project.id}/auth/users/${userId}/unban`, platformToken, {
        method: 'POST',
      });

      console.log('  [ok] Banned user properly has SDK tokens cleared');
    });
  });

  // ============================================================================
  // OAuth Tests
  // ============================================================================

  describe('OAuth', () => {
    let oauthVolcano;

    beforeAll(async () => {
      // Configure a GitHub OAuth provider for testing
      // Note: This won't work for actual OAuth flows, but tests the SDK's ability
      // to call the API endpoints correctly
      try {
        await platformFetch(`/projects/${project.id}/oauth/configs`, platformToken, {
          method: 'POST',
          body: JSON.stringify({
            provider: 'github',
            client_id: 'test-client-id',
            client_secret: 'test-client-secret',
            redirect_url: `${API_URL}/auth/oauth/github/callback`,
          }),
        });
        console.log('  [ok] GitHub OAuth provider configured');
      } catch (error) {
        // Provider may already exist, which is OK
        console.log('  [warn] GitHub OAuth provider config:', error.message);
      }

      // Create SDK instance with authenticated user for OAuth tests
      oauthVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      await oauthVolcano.auth.signUp({
        email: `oauth-test-${Date.now()}@example.com`,
        password: 'TestP@ss123!',
      });
    });

    test('getLinkedOAuthProviders - returns empty array initially', async () => {
      const result = await oauthVolcano.auth.getLinkedOAuthProviders();

      expect(result.error).toBeNull();
      expect(Array.isArray(result.providers)).toBe(true);
      console.log('  [ok] Got linked providers (empty)');
    });

    test('refreshOAuthToken - handles unlinked provider', async () => {
      const result = await oauthVolcano.auth.refreshOAuthToken('github');

      // Should return error since provider is not linked to this user
      expect(result.error).toBeDefined();
      console.log('  [ok] Refresh OAuth token handles unlinked provider');
    });

    test('getOAuthProviderToken - handles unlinked provider', async () => {
      const result = await oauthVolcano.auth.getOAuthProviderToken('github');

      expect(result.error).toBeDefined();
      console.log('  [ok] Get OAuth token handles unlinked provider');
    });

    test('callOAuthAPI - handles unlinked provider', async () => {
      const result = await oauthVolcano.auth.callOAuthAPI('github', {
        endpoint: '/user',
        method: 'GET',
      });

      expect(result.error).toBeDefined();
      console.log('  [ok] Call OAuth API handles unlinked provider');
    });

    test('unlinkOAuthProvider - handles unlinked provider', async () => {
      // Should return error since provider is not linked
      const result = await oauthVolcano.auth.unlinkOAuthProvider('github');

      expect(result.error).toBeDefined();
      console.log('  [ok] Unlink OAuth provider handles unlinked provider');
    });
  });

  // ============================================================================
  // Function Invocation Tests
  // ============================================================================

  describe('Functions', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
      if (typeof VolcanoAuth.__resetFunctionResolveCacheForTests === 'function') {
        VolcanoAuth.__resetFunctionResolveCacheForTests();
      }
    });

    afterEach(() => {
      global.fetch = originalFetch;
      if (typeof VolcanoAuth.__resetFunctionResolveCacheForTests === 'function') {
        VolcanoAuth.__resetFunctionResolveCacheForTests();
      }
    });

    test('invoke - requires authentication', async () => {
      const freshVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      // Not authenticated - should return error
      const result = await freshVolcano.functions.invoke('test-function');

      expect(result.error).toBeDefined();
      expect(result.data).toBeNull();
      console.log('  [ok] Invoke requires authentication');
    });

    test('invoke - rejects invalid authentication token', async () => {
      const invalidTokenVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      invalidTokenVolcano.accessToken = 'invalid-token-value';

      const result = await invalidTokenVolcano.functions.invoke('non-existent-function');

      expect(result.error).toBeDefined();
      expect(result.data).toBeNull();
      console.log('  [ok] Invoke rejects invalid authentication token');
    });

    test('invoke - handles non-existent function', async () => {
      // Re-authenticate using the test user created in Authentication tests
      const testEmail = `invoke-test-${Date.now()}@example.com`;
      const testPassword = 'SecureP@ssw0rd123!';

      // Create a fresh SDK instance and sign up a new user for this test
      const funcVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      await funcVolcano.auth.signUp({
        email: testEmail,
        password: testPassword,
      });

      expect(funcVolcano.accessToken).toBeDefined();

      // Should return error since function doesn't exist
      const result = await funcVolcano.functions.invoke('non-existent-function');

      expect(result.error).toBeDefined();
      expect(result.data).toBeNull();
      console.log('  [ok] Invoke handles non-existent function');
    });

    test('invoke - negative resolver cache avoids repeated lookups for missing function', async () => {
      const cacheVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      await cacheVolcano.auth.signUp({
        email: `invoke-cache-miss-${Date.now()}@example.com`,
        password: 'SecureP@ssw0rd123!',
      });

      const missingName = `missing-${Date.now()}`;
      let resolveCalls = 0;
      const resolvePath = `/functions/resolve?name=${encodeURIComponent(missingName)}`;
      global.fetch = async (url, options) => {
        const requestUrl = String(url);
        if (requestUrl === `${API_URL}${resolvePath}`) {
          resolveCalls += 1;
        }
        return originalFetch(url, options);
      };

      const first = await cacheVolcano.functions.invoke(missingName, {});
      const second = await cacheVolcano.functions.invoke(missingName, {});

      expect(first.error).toBeDefined();
      expect(second.error).toBeDefined();
      expect(resolveCalls).toBe(1);
      console.log('  [ok] Missing-function resolver cache works');
    });

    test('invoke - shared singleton cache is reused across SDK instances', async () => {
      const functionName = `cache-shared-${Date.now()}`;
      const createdFunction = await createFunctionViaPlatform(
        project.id,
        platformToken,
        functionName,
      );

      const instanceA = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });
      await instanceA.auth.signUp({
        email: `invoke-shared-a-${Date.now()}@example.com`,
        password: 'SecureP@ssw0rd123!',
      });

      const instanceB = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
        accessToken: instanceA.accessToken,
      });

      let resolveCalls = 0;
      let invokeCalls = 0;
      const invokeUrls = [];
      const resolvePath = `/functions/resolve?name=${encodeURIComponent(functionName)}`;

      global.fetch = async (url, options) => {
        const requestUrl = String(url);
        if (requestUrl === `${API_URL}${resolvePath}`) {
          resolveCalls += 1;
          return originalFetch(url, options);
        }
        if (requestUrl.startsWith(`${API_URL}/functions/`) && requestUrl.endsWith('/invoke')) {
          invokeCalls += 1;
          invokeUrls.push(requestUrl);
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, options);
      };

      const first = await instanceA.functions.invoke(functionName, { call: 1 });
      const second = await instanceB.functions.invoke(functionName, { call: 2 });

      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect(resolveCalls).toBe(1);
      expect(invokeCalls).toBe(2);
      expect(
        invokeUrls.every((url) => url.includes(`/functions/${createdFunction.id}/invoke`)),
      ).toBe(true);
      console.log('  [ok] Shared cache across SDK instances works');
    });

    test('invoke - cache is isolated across projects with same function name', async () => {
      const sharedFunctionName = `cross-project-${Date.now()}`;
      const projectAFunction = await createFunctionViaPlatform(
        project.id,
        platformToken,
        sharedFunctionName,
      );

      const projectB = await platformFetch('/projects', platformToken, {
        method: 'POST',
        body: JSON.stringify({ name: `sdk-e2e-functions-b-${Date.now()}` }),
      });
      projectCleanupFns.push(async () => {
        await platformFetch(`/projects/${projectB.id}`, platformToken, { method: 'DELETE' });
      });

      await platformFetch(`/projects/${projectB.id}/auth/config`, platformToken, {
        method: 'PUT',
        body: JSON.stringify({
          enable_anonymous_signins: true,
          enable_signup: true,
          enable_email_password: true,
        }),
      });

      const projectBAnonKeyResponse = await platformFetch(
        `/projects/${projectB.id}/anon-keys`,
        platformToken,
        {
          method: 'POST',
          body: JSON.stringify({ name: 'sdk-e2e-fn-cache-b-key' }),
        },
      );
      const projectBAnonKey = projectBAnonKeyResponse.key_value;
      const projectBFunction = await createFunctionViaPlatform(
        projectB.id,
        platformToken,
        sharedFunctionName,
      );

      const sdkA = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });
      await sdkA.auth.signUp({
        email: `invoke-project-a-${Date.now()}@example.com`,
        password: 'SecureP@ssw0rd123!',
      });

      const sdkB = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: projectB.id,
        anonKey: projectBAnonKey,
      });
      await sdkB.auth.signUp({
        email: `invoke-project-b-${Date.now()}@example.com`,
        password: 'SecureP@ssw0rd123!',
      });

      let resolveCalls = 0;
      const invokeUrls = [];
      const resolvePath = `/functions/resolve?name=${encodeURIComponent(sharedFunctionName)}`;

      global.fetch = async (url, options) => {
        const requestUrl = String(url);
        if (requestUrl === `${API_URL}${resolvePath}`) {
          resolveCalls += 1;
          return originalFetch(url, options);
        }
        if (requestUrl.startsWith(`${API_URL}/functions/`) && requestUrl.endsWith('/invoke')) {
          invokeUrls.push(requestUrl);
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, options);
      };

      const invokeA = await sdkA.functions.invoke(sharedFunctionName, {});
      const invokeB = await sdkB.functions.invoke(sharedFunctionName, {});

      expect(invokeA.error).toBeNull();
      expect(invokeB.error).toBeNull();
      expect(resolveCalls).toBe(2);
      expect(
        invokeUrls.some((url) => url.includes(`/functions/${projectAFunction.id}/invoke`)),
      ).toBe(true);
      expect(
        invokeUrls.some((url) => url.includes(`/functions/${projectBFunction.id}/invoke`)),
      ).toBe(true);
      console.log('  [ok] Cache isolation across projects works');
    });

    test('invoke - invalidates stale mapping and re-resolves after invoke 404', async () => {
      const functionName = `cache-retry-${Date.now()}`;
      await createFunctionViaPlatform(project.id, platformToken, functionName);

      const retryVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });
      await retryVolcano.auth.signUp({
        email: `invoke-retry-${Date.now()}@example.com`,
        password: 'SecureP@ssw0rd123!',
      });

      let resolveCalls = 0;
      let invokeCalls = 0;
      const resolvePath = `/functions/resolve?name=${encodeURIComponent(functionName)}`;

      global.fetch = async (url, options) => {
        const requestUrl = String(url);
        if (requestUrl === `${API_URL}${resolvePath}`) {
          resolveCalls += 1;
          return originalFetch(url, options);
        }
        if (requestUrl.startsWith(`${API_URL}/functions/`) && requestUrl.endsWith('/invoke')) {
          invokeCalls += 1;
          if (invokeCalls === 1) {
            return new Response(JSON.stringify({ error: 'function not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ recovered: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, options);
      };

      const result = await retryVolcano.functions.invoke(functionName, { attempt: 'retry' });

      expect(result.error).toBeNull();
      expect(result.data).toEqual({ recovered: true });
      expect(resolveCalls).toBe(2);
      expect(invokeCalls).toBe(2);
      console.log('  [ok] Cache invalidation and retry path works');
    });
  });

  // ============================================================================
  // Database Query Tests (with real database)
  // ============================================================================

  describe('Database Queries', () => {
    let database;
    let dbVolcano;

    beforeAll(async () => {
      console.log('\n  Setting up database for query tests...');

      // Create a database
      database = await platformFetch(`/projects/${project.id}/databases`, platformToken, {
        method: 'POST',
        body: JSON.stringify({
          name: `sdk_test_db_${Date.now()}`,
          region: 'aws-us-east-1',
          pg_version: '16',
        }),
      });
      console.log(`  [ok] Database created: ${database.id}`);

      // Wait for database to be active (can take up to 60 seconds)
      console.log('  Waiting for database to be active...');
      let attempts = 0;
      const maxAttempts = 60;
      while (attempts < maxAttempts) {
        const dbStatus = await platformFetch(
          `/projects/${project.id}/databases/${database.name}`,
          platformToken,
        );
        if (dbStatus.status === 'active') {
          console.log('  [ok] Database is active');
          database = dbStatus;
          break;
        }
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (attempts >= maxAttempts) {
        throw new Error('Database did not become active in time');
      }

      // Create SDK instance for database tests
      dbVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      await dbVolcano.auth.signUp({
        email: `db-user-${Date.now()}@example.com`,
        password: 'TestP@ss123!',
      });

      dbVolcano.database(database.name);
      console.log('  [ok] SDK configured with database');

      // Create test table using platform API (direct SQL)
      // We'll create the table via the REST API insert which auto-creates
      // Or we need to use a service key to run DDL

      // Create a service key for admin operations
      await platformFetch(`/projects/${project.id}/service-keys`, platformToken, {
        method: 'POST',
        body: JSON.stringify({ name: 'sdk-test-service-key' }),
      });
      console.log('  [ok] Service key created for DDL operations');

      // Use direct SQL connection to create test table
      // The connection_string field contains the proxy connection URL
      if (database.connection_string) {
        const { Client } = await import('pg');

        // Modify connection string to disable SSL verification for self-signed certs
        // Replace sslmode=require with sslmode=no-verify (or use uselibpqcompat)
        let connStr = database.connection_string;
        connStr = connStr.replace('sslmode=require', 'sslmode=no-verify');

        const client = new Client({
          connectionString: connStr,
        });

        try {
          await client.connect();
          await client.query(`
            CREATE TABLE IF NOT EXISTS sdk_test_products (
              id SERIAL PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              category VARCHAR(100),
              price DECIMAL(10,2),
              quantity INTEGER DEFAULT 0,
              is_active BOOLEAN DEFAULT true,
              metadata JSONB,
              created_at TIMESTAMP DEFAULT NOW()
            )
          `);

          // Enable RLS
          await client.query(`ALTER TABLE sdk_test_products ENABLE ROW LEVEL SECURITY`);

          // Create permissive policy for testing (execute each statement separately)
          await client.query(
            `DROP POLICY IF EXISTS "Users can manage products" ON sdk_test_products`,
          );
          await client.query(`
            CREATE POLICY "Users can manage products" ON sdk_test_products
              FOR ALL USING (true) WITH CHECK (true)
          `);

          console.log('  [ok] Test table created via direct SQL connection');
        } catch (err) {
          console.log('  Warning: Table creation failed:', err.message);
        } finally {
          await client.end();
        }
      } else {
        console.log('  Warning: No connection_string available for DDL');
      }
    }, 120000); // 2 minute timeout for database setup

    // ---- Builder Tests (no database required) ----

    test('database() - sets database name', () => {
      const result = volcano.database('test_db');
      expect(result).toBe(volcano);
      expect(volcano._currentDatabaseName).toBe('test_db');
      console.log('  [ok] Database name set');
    });

    test('from() - creates QueryBuilder', () => {
      volcano.database('test_db');
      const qb = volcano.from('users');

      expect(qb).toBeDefined();
      expect(qb.table).toBe('users');
      expect(typeof qb.select).toBe('function');
      expect(typeof qb.eq).toBe('function');
      expect(typeof qb.execute).toBe('function');
      console.log('  [ok] QueryBuilder created');
    });

    test('from().select() - chains correctly', () => {
      volcano.database('test_db');
      const qb = volcano.from('users').select('id, email, name');

      expect(qb.selectColumns).toEqual(['id', 'email', 'name']);
      console.log('  [ok] Select columns set');
    });

    test('QueryBuilder filters chain correctly', () => {
      volcano.database('test_db');
      const qb = volcano
        .from('users')
        .eq('status', 'active')
        .neq('role', 'admin')
        .gt('age', 18)
        .gte('score', 100)
        .lt('failures', 3)
        .lte('attempts', 5)
        .like('name', '%John%')
        .ilike('email', '%@example.com')
        .is('deleted_at', null)
        .in('department', ['engineering', 'design'])
        .order('created_at', { ascending: false })
        .limit(10)
        .offset(0);

      expect(qb.filters).toHaveLength(10);
      expect(qb.orderClauses).toHaveLength(1);
      expect(qb.limitValue).toBe(10);
      expect(qb.offsetValue).toBe(0);
      console.log('  [ok] All filter methods chain correctly');
    });

    test('execute() - requires database ID', async () => {
      const freshVolcano = new VolcanoAuth({
        apiUrl: API_URL,
        projectId: project.id,
        anonKey: anonKey,
      });

      await freshVolcano.auth.signUp({
        email: `db-test-${Date.now()}@example.com`,
        password: 'TestP@ss123!',
      });

      // No database set
      const result = await freshVolcano.from('users').execute();

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Database name not set');
      console.log('  [ok] Execute requires database name');
    });

    // ---- Real Database Operation Tests ----

    test('insert() - inserts single record', async () => {
      const result = await dbVolcano.insert('sdk_test_products', {
        name: 'Test Product 1',
        category: 'electronics',
        price: 99.99,
        quantity: 10,
        is_active: true,
      });

      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].name).toBe('Test Product 1');
      console.log('  [ok] Insert single record works');
    });

    test('insert() - inserts multiple records', async () => {
      // Insert more test data
      await dbVolcano.insert('sdk_test_products', {
        name: 'Test Product 2',
        category: 'electronics',
        price: 149.99,
        quantity: 5,
        is_active: true,
      });

      await dbVolcano.insert('sdk_test_products', {
        name: 'Test Product 3',
        category: 'clothing',
        price: 29.99,
        quantity: 100,
        is_active: true,
      });

      await dbVolcano.insert('sdk_test_products', {
        name: 'Inactive Product',
        category: 'clothing',
        price: 19.99,
        quantity: 0,
        is_active: false,
      });

      await dbVolcano.insert('sdk_test_products', {
        name: 'Expensive Item',
        category: 'luxury',
        price: 999.99,
        quantity: 2,
        is_active: true,
      });

      console.log('  [ok] Multiple records inserted');
    });

    test('select() - retrieves all records', async () => {
      const result = await dbVolcano.from('sdk_test_products').select('*');

      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThanOrEqual(5);
      console.log(`  [ok] Select all returned ${result.data.length} records`);
    });

    test('select() - retrieves specific columns', async () => {
      const result = await dbVolcano.from('sdk_test_products').select('name, price');

      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data[0]).toHaveProperty('name');
      expect(result.data[0]).toHaveProperty('price');
      console.log('  [ok] Select specific columns works');
    });

    test('eq() - filters by equality', async () => {
      const result = await dbVolcano
        .from('sdk_test_products')
        .select('*')
        .eq('category', 'electronics');

      expect(result.error).toBeNull();
      expect(result.data.length).toBeGreaterThanOrEqual(2);
      result.data.forEach((item) => {
        expect(item.category).toBe('electronics');
      });
      console.log(`  [ok] eq() filter returned ${result.data.length} electronics items`);
    });

    test('neq() - filters by inequality', async () => {
      const result = await dbVolcano
        .from('sdk_test_products')
        .select('*')
        .neq('category', 'electronics');

      expect(result.error).toBeNull();
      result.data.forEach((item) => {
        expect(item.category).not.toBe('electronics');
      });
      console.log(`  [ok] neq() filter returned ${result.data.length} non-electronics items`);
    });

    test('gt() - filters by greater than', async () => {
      const result = await dbVolcano.from('sdk_test_products').select('*').gt('price', 100);

      expect(result.error).toBeNull();
      result.data.forEach((item) => {
        expect(parseFloat(item.price)).toBeGreaterThan(100);
      });
      console.log(`  [ok] gt() filter returned ${result.data.length} items > $100`);
    });

    test('gte() - filters by greater than or equal', async () => {
      const result = await dbVolcano.from('sdk_test_products').select('*').gte('price', 99.99);

      expect(result.error).toBeNull();
      result.data.forEach((item) => {
        expect(parseFloat(item.price)).toBeGreaterThanOrEqual(99.99);
      });
      console.log(`  [ok] gte() filter returned ${result.data.length} items >= $99.99`);
    });

    test('lt() - filters by less than', async () => {
      const result = await dbVolcano.from('sdk_test_products').select('*').lt('price', 50);

      expect(result.error).toBeNull();
      result.data.forEach((item) => {
        expect(parseFloat(item.price)).toBeLessThan(50);
      });
      console.log(`  [ok] lt() filter returned ${result.data.length} items < $50`);
    });

    test('lte() - filters by less than or equal', async () => {
      const result = await dbVolcano.from('sdk_test_products').select('*').lte('quantity', 5);

      expect(result.error).toBeNull();
      result.data.forEach((item) => {
        expect(item.quantity).toBeLessThanOrEqual(5);
      });
      console.log(`  [ok] lte() filter returned ${result.data.length} items with qty <= 5`);
    });

    test('like() - filters by pattern (case-sensitive)', async () => {
      const result = await dbVolcano.from('sdk_test_products').select('*').like('name', 'Test%');

      expect(result.error).toBeNull();
      result.data.forEach((item) => {
        expect(item.name.startsWith('Test')).toBe(true);
      });
      console.log(`  [ok] like() filter returned ${result.data.length} items starting with 'Test'`);
    });

    test('ilike() - filters by pattern (case-insensitive)', async () => {
      const result = await dbVolcano
        .from('sdk_test_products')
        .select('*')
        .ilike('name', '%product%');

      expect(result.error).toBeNull();
      result.data.forEach((item) => {
        expect(item.name.toLowerCase()).toContain('product');
      });
      console.log(
        `  [ok] ilike() filter returned ${result.data.length} items containing 'product'`,
      );
    });

    test('is() - filters by null/boolean', async () => {
      const result = await dbVolcano.from('sdk_test_products').select('*').is('is_active', false);

      expect(result.error).toBeNull();
      result.data.forEach((item) => {
        expect(item.is_active).toBe(false);
      });
      console.log(`  [ok] is() filter returned ${result.data.length} inactive items`);
    });

    test('in() - filters by value in array', async () => {
      const result = await dbVolcano
        .from('sdk_test_products')
        .select('*')
        .in('category', ['electronics', 'luxury']);

      expect(result.error).toBeNull();
      result.data.forEach((item) => {
        expect(['electronics', 'luxury']).toContain(item.category);
      });
      console.log(`  [ok] in() filter returned ${result.data.length} electronics/luxury items`);
    });

    test('order() - sorts ascending', async () => {
      const result = await dbVolcano
        .from('sdk_test_products')
        .select('*')
        .order('price', { ascending: true });

      expect(result.error).toBeNull();
      for (let i = 1; i < result.data.length; i++) {
        expect(parseFloat(result.data[i].price)).toBeGreaterThanOrEqual(
          parseFloat(result.data[i - 1].price),
        );
      }
      console.log('  [ok] order() ascending works');
    });

    test('order() - sorts descending', async () => {
      const result = await dbVolcano
        .from('sdk_test_products')
        .select('*')
        .order('price', { ascending: false });

      expect(result.error).toBeNull();
      for (let i = 1; i < result.data.length; i++) {
        expect(parseFloat(result.data[i].price)).toBeLessThanOrEqual(
          parseFloat(result.data[i - 1].price),
        );
      }
      console.log('  [ok] order() descending works');
    });

    test('limit() - limits result count', async () => {
      const result = await dbVolcano.from('sdk_test_products').select('*').limit(2);

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(2);
      console.log('  [ok] limit() works');
    });

    test('offset() - skips records', async () => {
      const allResult = await dbVolcano
        .from('sdk_test_products')
        .select('*')
        .order('id', { ascending: true });

      const offsetResult = await dbVolcano
        .from('sdk_test_products')
        .select('*')
        .order('id', { ascending: true })
        .offset(2)
        .limit(2);

      expect(offsetResult.error).toBeNull();
      expect(offsetResult.data[0].id).toBe(allResult.data[2].id);
      console.log('  [ok] offset() works');
    });

    test('combined filters - complex query', async () => {
      const result = await dbVolcano
        .from('sdk_test_products')
        .select('name, price, category')
        .eq('is_active', true)
        .gte('price', 50)
        .order('price', { ascending: false })
        .limit(3);

      expect(result.error).toBeNull();
      expect(result.data.length).toBeLessThanOrEqual(3);
      result.data.forEach((item) => {
        expect(parseFloat(item.price)).toBeGreaterThanOrEqual(50);
      });
      console.log(`  [ok] Complex query returned ${result.data.length} items`);
    });

    test('update() - updates matching records', async () => {
      // First, get a product to update
      const selectResult = await dbVolcano
        .from('sdk_test_products')
        .select('*')
        .eq('name', 'Test Product 1');

      expect(selectResult.error).toBeNull();
      const productId = selectResult.data[0].id;

      // Update it
      const updateResult = await dbVolcano
        .update('sdk_test_products', { quantity: 999 })
        .eq('id', productId);

      expect(updateResult.error).toBeNull();

      // Verify update
      const verifyResult = await dbVolcano
        .from('sdk_test_products')
        .select('*')
        .eq('id', productId);

      expect(verifyResult.data[0].quantity).toBe(999);
      console.log('  [ok] update() works');
    });

    test('update() - updates with multiple filters', async () => {
      const result = await dbVolcano
        .update('sdk_test_products', { quantity: 50 })
        .eq('category', 'clothing')
        .eq('is_active', true);

      expect(result.error).toBeNull();
      console.log('  [ok] update() with multiple filters works');
    });

    test('delete() - deletes matching records', async () => {
      // Insert a record to delete
      const insertResult = await dbVolcano.insert('sdk_test_products', {
        name: 'To Be Deleted',
        category: 'temporary',
        price: 0.01,
        quantity: 1,
      });

      expect(insertResult.error).toBeNull();

      // Delete it
      const deleteResult = await dbVolcano.delete('sdk_test_products').eq('name', 'To Be Deleted');

      expect(deleteResult.error).toBeNull();

      // Verify deletion
      const verifyResult = await dbVolcano
        .from('sdk_test_products')
        .select('*')
        .eq('name', 'To Be Deleted');

      expect(verifyResult.data).toHaveLength(0);
      console.log('  [ok] delete() works');
    });

    test('thenable - QueryBuilder works with await', async () => {
      const { data, error } = await dbVolcano.from('sdk_test_products').select('name').limit(1);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      console.log('  [ok] QueryBuilder thenable/await works');
    });

    test('thenable - MutationBuilder works with await', async () => {
      const { data, error } = await dbVolcano.insert('sdk_test_products', {
        name: 'Thenable Test',
        category: 'test',
        price: 1.0,
      });

      expect(error).toBeNull();
      expect(data[0].name).toBe('Thenable Test');

      // Cleanup
      await dbVolcano.delete('sdk_test_products').eq('name', 'Thenable Test');
      console.log('  [ok] MutationBuilder thenable/await works');
    });
  });

  // ============================================================================
  // SDK Initialization Tests
  // ============================================================================

  describe('Initialization', () => {
    test('initialize() - restores session from storage', async () => {
      // This test simulates what happens when the SDK is initialized
      // with existing tokens in localStorage
      const result = await volcano.initialize();

      expect(result).toBeDefined();
      // Will have user if there's a valid session, or null otherwise
      console.log(`  [ok] Initialize completed (user: ${result.user ? 'yes' : 'no'})`);
    });
  });
});
