import type {
  AuthSession,
  EmailChangeResponse,
  LinkProviderResponse,
  OAuthProvider,
  OAuthProviderName,
  OAuthTokenResponse,
  Session,
  SessionsResponse,
  StorageObject,
  User,
} from '@volcano.dev/sdk';

declare const user: User;
declare const session: Session;
declare const sessions: SessionsResponse;
declare const authSession: AuthSession;
declare const provider: OAuthProvider;
declare const link: LinkProviderResponse;
declare const token: OAuthTokenResponse;
declare const storage: StorageObject;
declare const email: EmailChangeResponse;

export const minimalUser: User = { id: 'user-1', email: 'user@example.com' };
export const cookieSession: Session = {
  access_token: 'access',
  refresh_token: undefined,
  expires_in: 3600,
};
export const absentProvider: OAuthProvider = {};
export const absentLink: LinkProviderResponse = {};

// @ts-expect-error successful user responses may omit timestamps
export const createdAt: string = user.created_at;
// @ts-expect-error cookie sessions have no JavaScript-readable refresh token
export const refreshToken: string = session.refresh_token;
// @ts-expect-error successful session lists may omit pagination
export const total: number = sessions.total;
// @ts-expect-error session timestamps are optional in the wire schema
export const sessionCreatedAt: string = authSession.created_at;
// @ts-expect-error returned provider names are optional free-form strings
export const providerName: OAuthProviderName = provider.provider;
// @ts-expect-error linked-provider timestamps may be omitted
export const linkedAt: string = provider.linked_at;
// @ts-expect-error a successful link response can omit the authorization URL
export const authorizationUrl: string = link.authorization_url;
// @ts-expect-error token expiry is undefined when omitted, as well as nullable on failure
export const expiry: number | null = token.expiresIn;
// @ts-expect-error storage timestamps may be omitted
export const storageCreatedAt: string = storage.created_at;
// @ts-expect-error ownerless storage objects can have an explicit null owner
export const owner: string | undefined = storage.owner_id;
// @ts-expect-error successful email changes may contain an explicit undefined token
export const exactOptionalToken: { emailChangeToken?: string } = email;
