import type { VolcanoAuth } from '../../src/index.ts';
import { reply } from '../auth-concurrency-fixtures.ts';

export const SESSION = '00000000-0000-4000-8000-000000000001';
export const OTHER = '00000000-0000-4000-8000-000000000002';
export const token = (id: string, version = 1): string =>
  `header.${Buffer.from(JSON.stringify({ session_id: id, version })).toString('base64url')}.signature`;
export const renewed = () =>
  reply(200, {
    access_token: token(SESSION, 2),
    refresh_token: 'rotated',
    expires_in: 3600,
    user: { id: 'user', email: 'user@example.com', status: 'active' },
  });
export const replacement = {
  access_token: token(OTHER),
  refresh_token: 'other-refresh',
  user: { id: 'other', email: 'other@example.com', status: 'active' },
} as const;

type SignOut = ReturnType<VolcanoAuth['auth']['signOut']>;

export async function signOutAfterRefreshSettles(current: VolcanoAuth, settleRefresh: () => Promise<void>): SignOut {
  await settleRefresh();
  return current.auth.signOut();
}

export async function signOutDuringRefresh(current: VolcanoAuth, settleRefresh: () => Promise<void>): SignOut {
  const signingOut = current.auth.signOut();
  await settleRefresh();
  return signingOut;
}

export function signIn(current: VolcanoAuth): Promise<unknown> {
  return current.auth.signIn({ email: 'user@example.com', password: 'synthetic' });
}
