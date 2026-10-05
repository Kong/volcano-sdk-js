import {
  type Auth,
  AuthRefreshDiscardedError,
  AuthSessionChangedError,
  type ProjectLockLease,
  type ProjectLocks,
  type User,
  type UserStatus,
  VolcanoClient,
  VolcanoSystemError,
} from '../../src/index.ts';

declare const user: User;
declare const auth: Auth;
declare const locks: ProjectLocks;
declare const lease: ProjectLockLease;
declare const signal: AbortSignal;

const projectId: string | undefined = user.project_id;
const emailConfirmed: boolean | undefined = user.email_confirmed;
const appMetadata: User['user_metadata'] = user.app_metadata;
const avatarUrl: string | undefined = user.avatar_url;
const status: UserStatus | undefined = user.status;
const bannedUntil: string | null | undefined = user.banned_until;
const lastSignInAt: string | undefined = user.last_sign_in_at;

export const userFields = [
  projectId,
  emailConfirmed,
  appMetadata,
  avatarUrl,
  status,
  bannedUntil,
  lastSignInAt,
];
export const reset = auth.resetPasswordForEmail('alice@example.com');
const tokenClient = new VolcanoClient({ anonKey: 'example', accessToken: 'supplied-access' });
export const session = tokenClient.auth.getSession();
export const renewal = locks.renew('leader', lease, { ttl: 5, signal });

// Auth errors historically inherit Error's constructor signature in declarations.
export const refreshError = new AuthRefreshDiscardedError('ignored', {
  cause: new Error('ignored'),
});
export const sessionError = new AuthSessionChangedError('ignored', {
  cause: new Error('ignored'),
});
const systemFailure = new VolcanoSystemError('failed', {
  status: null,
  code: 'gateway_failed',
  retryAfter: 0,
  cause: new Error('network'),
});
export const systemFailureName: 'VolcanoSystemError' = systemFailure.name;
