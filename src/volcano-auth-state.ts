import {
  generateAuthStateNonce,
  getStorageItem,
  hasOAuthCallbackInUrl,
  hasSessionInUrl,
  peekAuthRedirectUrl,
  peekAuthState,
  removeOAuthResponseParams,
  removeStorageItem,
  setStorageItem,
  storeAuthState,
  stripAuthHashFromUrl,
  stripOAuthQueryFromUrl,
  takeAuthRedirectUrl,
  takeAuthState,
} from './auth-browser.ts';
import { AuthSessionOperations } from './auth-session.ts';
import type { AuthContext, RefreshResult, SignOutResult } from './auth-session-lifecycle.ts';
import {
  adoptSessionInMemory,
  captureAuthContext,
  clearSession,
  clearSessionAtGeneration,
  isAuthContextCurrent,
  notifyAuthCallbacks,
  setRefreshedSession,
  setSession,
} from './auth-session-state.ts';
import type { DurableFacade } from './durable-facade.ts';
import { type FunctionResolveState, getSharedFunctionResolveState } from './function-resolve-cache.ts';
import type { User, VolcanoAuthConfig } from './sdk-public-types.ts';
import { configApiUrl, configTimeout, requireAnonKey, type RuntimeTransport } from './volcano-auth-config.ts';

export class VolcanoAuthState {
  /** @internal */
  readonly apiUrl: string;
  /** @internal */
  readonly anonKey: string;
  /** @internal */
  readonly timeout: number;
  /** @internal */
  _currentDatabaseName: string | null;
  /** @internal */
  currentUser: User | null;
  /** @internal */
  _sessionGeneration: number;
  /** @internal */
  _urlSessionConsumed: boolean;
  /** @internal */
  _pendingUrlAuthNotify: boolean;
  /** @internal */
  _oauthExchangePromise: Promise<boolean> | null;
  /** @internal */
  _sessionOperations: AuthSessionOperations<RefreshResult, SignOutResult>;
  /** @internal */
  _oauthExchangeError: Error | null;
  /** @internal */
  _authCallbacks: ((user: User | null) => void)[];
  /** @internal */
  _functionResolveState: FunctionResolveState;
  /** @internal */
  _transport!: RuntimeTransport;
  /** @internal */
  _durableFacade!: DurableFacade;
  /** @internal */
  accessToken!: string | null;
  /** @internal */
  refreshToken!: string | null;

  /** @internal */
  constructor(config: VolcanoAuthConfig) {
    requireAnonKey(config.anonKey);
    this.apiUrl = configApiUrl(config);
    this.anonKey = config.anonKey;
    this.timeout = configTimeout(config.timeout);
    this._currentDatabaseName = null;
    this.currentUser = null;
    this._sessionGeneration = 0;
    // Tracks whether a managed-redirect session was already adopted from the URL
    // fragment so repeated getUser()/initialize() calls don't re-adopt and
    // re-fire auth callbacks when the hash can't be stripped (see
    // _consumeSessionFromUrl / _stripAuthHashFromUrl).
    this._urlSessionConsumed = false;
    // A redirect session adopted in the constructor (the common SPA path) can't
    // fire onAuthStateChange yet — no listeners are registered and currentUser
    // is still null. Remember the adoption so the first getUser()/initialize()
    // that resolves a user announces the SIGNED_IN transition exactly once.
    this._pendingUrlAuthNotify = false;
    this._oauthExchangePromise = null;
    this._sessionOperations = new AuthSessionOperations();
    // Keep a terminal callback error until initialize()/refreshSession() consumes
    // it or a new session is set or cleared.
    this._oauthExchangeError = null;
    this._authCallbacks = [];
    this._functionResolveState = getSharedFunctionResolveState();
  }

  /** @internal */
  _captureAuthContext(): ReturnType<typeof captureAuthContext> {
    return captureAuthContext(this);
  }

  /** @internal */
  _adoptSessionInMemory(session: Parameters<typeof adoptSessionInMemory>[1]): void {
    adoptSessionInMemory(this, session);
  }

  /** @internal */
  _isAuthContextCurrent(context: AuthContext): ReturnType<typeof isAuthContextCurrent> {
    return isAuthContextCurrent(this, context);
  }

  /** @internal */
  _setSession(
    data: Parameters<typeof setSession>[1],
    expectedGeneration = this._sessionGeneration,
  ): ReturnType<typeof setSession> {
    return setSession(this, data, expectedGeneration);
  }

  /** @internal */
  _setRefreshedSession(
    data: Parameters<typeof setRefreshedSession>[1],
    context: AuthContext,
  ): ReturnType<typeof setRefreshedSession> {
    return setRefreshedSession(this, data, context);
  }

  /** @internal */
  _clearSession(context: AuthContext): ReturnType<typeof clearSession> {
    return clearSession(this, context);
  }

  /** @internal */
  _clearSessionAtGeneration(generation: number): ReturnType<typeof clearSessionAtGeneration> {
    return clearSessionAtGeneration(this, generation);
  }

  /** @internal */
  _notifyAuthCallbacks(user: User | null): void {
    notifyAuthCallbacks(this, user);
  }

  /** @internal */
  _hasOAuthCallbackInUrl(): ReturnType<typeof hasOAuthCallbackInUrl> {
    return hasOAuthCallbackInUrl(this._peekAuthRedirectURL(), Boolean(this._peekAuthState()));
  }

  /** @internal */
  _stripOAuthQueryFromUrl(callbackURL: URL): void {
    stripOAuthQueryFromUrl(callbackURL);
  }

  /** @internal */
  _removeOAuthResponseParams(callbackURL: URL, clearHash = true): void {
    removeOAuthResponseParams(callbackURL, clearHash);
  }

  /**
   * Returns true when the current browser URL fragment carries a managed-auth
   * session hand-off (i.e. an access_token from a hosted login/signup redirect).
   * Cheap peek that does not mutate state.
   */
  /** @internal */
  _hasSessionInUrl(): ReturnType<typeof hasSessionInUrl> {
    return hasSessionInUrl();
  }

  /**
   * Remove the managed-auth tokens from the URL fragment so they do not linger
   * in history, referrers, or bookmarks. Only strips when the fragment is
   * exclusively the hand-off params, to avoid clobbering app hash routing.
   */
  /** @internal */
  _stripAuthHashFromUrl(params: URLSearchParams): void {
    stripAuthHashFromUrl(params);
  }

  // Generate a one-time, unguessable nonce for the managed/OAuth redirect flow.
  // This is a CSRF defense, so it must be cryptographically random — we require
  // Web Crypto (browsers and Node >= 20 provide it) rather than fall back to a
  // predictable PRNG.
  /** @internal */
  _generateAuthStateNonce(): ReturnType<typeof generateAuthStateNonce> {
    return generateAuthStateNonce();
  }

  // Persist the nonce across the redirect. sessionStorage is per-tab+origin and
  // survives the navigation away to the hosted page and back to this origin.
  /** @internal */
  _storeAuthState(nonce: string, redirectURL = ''): void {
    storeAuthState(nonce, redirectURL);
  }

  // Read and clear the stored nonce (one-time use).
  /** @internal */
  _takeAuthState(): ReturnType<typeof takeAuthState> {
    return takeAuthState();
  }

  /** @internal */
  _peekAuthState(): ReturnType<typeof peekAuthState> {
    return peekAuthState();
  }

  /** @internal */
  _takeAuthRedirectURL(): ReturnType<typeof takeAuthRedirectUrl> {
    return takeAuthRedirectUrl();
  }

  /** @internal */
  _peekAuthRedirectURL(): ReturnType<typeof peekAuthRedirectUrl> {
    return peekAuthRedirectUrl();
  }

  /** @internal */
  _getStorageItem(key: string): ReturnType<typeof getStorageItem> {
    return getStorageItem(key);
  }

  /** @internal */
  _setStorageItem(key: string, value: string): void {
    setStorageItem(key, value);
  }

  /** @internal */
  _removeStorageItem(key: string): void {
    removeStorageItem(key);
  }
}
