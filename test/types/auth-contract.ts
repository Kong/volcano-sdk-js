import type { Auth, ProjectLockLease, ProjectLocks, User, UserStatus } from '../../src/index.js';

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

void [projectId, emailConfirmed, appMetadata, avatarUrl, status, bannedUntil, lastSignInAt];
void auth.resetPasswordForEmail('alice@example.com');
void locks.renew('leader', lease, { ttl: 5, signal });
