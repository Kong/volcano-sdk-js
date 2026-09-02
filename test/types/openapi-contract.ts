import type {
  Auth,
  CompleteSession,
  OpenAPIComponents,
  OpenAPIOperations,
  UploadSessionStatusResponse,
} from '../../src/index.js';
import { AuthRefreshDiscardedError, AuthSessionChangedError } from '../../src/index.js';

type Assert<T extends true> = T;
type Equal<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;

type SetSessionParameter = Parameters<Auth['setSession']>[0];
type _CompleteSessionCanBeAdopted = Assert<
  CompleteSession extends SetSessionParameter ? true : false
>;
type _SetSessionRejectsNullRefreshToken = Assert<
  null extends SetSessionParameter['refresh_token'] ? false : true
>;
type _SetSessionRejectsNullUser = Assert<null extends SetSessionParameter['user'] ? false : true>;

declare const sourceAuth: Auth;
declare const targetAuth: Auth;

async function adoptCurrentSession() {
  const {
    data: { session },
  } = await sourceAuth.getSession();
  if (!session?.refresh_token || !session.user) {
    return;
  }
  await targetAuth.setSession({
    ...session,
    refresh_token: session.refresh_token,
    user: session.user,
  });
}

void adoptCurrentSession;

type SignupBody = OpenAPIOperations['authSignup']['requestBody']['content']['application/json'];
type SignupMetadata = NonNullable<SignupBody['user_metadata']>;
type _SignupMetadataAcceptsProperties = Assert<
  { display_name: string } extends SignupMetadata ? true : false
>;

type AuthUser = OpenAPIComponents['schemas']['AuthUser'];
type UserMetadata = NonNullable<AuthUser['user_metadata']>;
type AppMetadata = NonNullable<AuthUser['app_metadata']>;
type _UserMetadataAcceptsProperties = Assert<
  { display_name: string } extends UserMetadata ? true : false
>;
type _AppMetadataAcceptsProperties = Assert<{ role: string } extends AppMetadata ? true : false>;
type _AuthUserBanCanBeNull = Assert<null extends AuthUser['banned_until'] ? true : false>;

type CreateProjectRequest = OpenAPIComponents['schemas']['CreateProjectRequest'];
type _DefaultedRequestFieldsStayOptional = Assert<
  { name: string } extends CreateProjectRequest ? true : false
>;

type StorageBucket = OpenAPIComponents['schemas']['StorageBucket'];
type StorageObject = OpenAPIComponents['schemas']['StorageObject'];
type _StorageLimitsCanBeNull = Assert<null extends StorageBucket['file_size_limit'] ? true : false>;
type _StorageMimeTypesCanBeNull = Assert<
  null extends StorageBucket['allowed_mime_types'] ? true : false
>;
type _StorageOwnerCanBeNull = Assert<null extends StorageObject['owner_id'] ? true : false>;

type UploadSessionStatus = NonNullable<UploadSessionStatusResponse['data']>;
type UploadSessionStatusShape = {
  session_id: string;
  status: 'pending' | 'uploading' | 'completing' | 'completed' | 'aborted';
  path: string;
  content_type: string;
  total_size: number;
  part_size: number;
  total_parts: number;
  parts_uploaded: number;
  bytes_uploaded: number;
  parts: { part_number: number; etag: string; size: number }[];
  expires_at: string;
  created_at: string;
};
type _UploadSessionStatusMatchesHosting = Assert<
  Equal<UploadSessionStatus, UploadSessionStatusShape>
>;

type InvocationPayload = NonNullable<
  OpenAPIComponents['schemas']['FunctionInvocationRequest']['payload']
>;
type _InvocationPayloadAcceptsProperties = Assert<
  { action: string } extends InvocationPayload ? true : false
>;

type OAuthRequest =
  OpenAPIOperations['callOAuthProviderAPI']['requestBody']['content']['application/json'];
type OAuthBody = NonNullable<OAuthRequest['body']>;
type OAuthResponse =
  OpenAPIOperations['callOAuthProviderAPI']['responses'][200]['content']['application/json'];
type _OAuthBodyAcceptsProperties = Assert<{ visibility: string } extends OAuthBody ? true : false>;
type OAuthResponseShape = {
  provider: 'google' | 'github' | 'microsoft' | 'apple';
  endpoint: string;
  status_code: number;
  data: unknown;
};
type _OAuthResponseUsesHostingEnvelope = Assert<Equal<OAuthResponse, OAuthResponseShape>>;

type LogSearchEvent = OpenAPIComponents['schemas']['LogSearchEvent'];
type LogSearchEventShape = {
  id: string;
  timestamp: string;
  body: string;
  resource: OpenAPIComponents['schemas']['LogResource'];
};
type _LogSearchEventIsUsable = Assert<LogSearchEventShape extends LogSearchEvent ? true : false>;
type LogSearchEventStructuredShape = Omit<LogSearchEventShape, 'body'> & {
  body: { attempt: number };
};
type _LogSearchEventBodyKeepsJsonTypes = Assert<
  LogSearchEventStructuredShape extends LogSearchEvent ? true : false
>;

declare const refreshError: unknown;
if (AuthRefreshDiscardedError.is(refreshError)) {
  const code: 'auth_refresh_discarded' = refreshError.code;
  const status: 409 = refreshError.status;
  const name: 'AuthRefreshDiscardedError' = refreshError.name;
  void [code, status, name];
}

declare const sessionChangedError: unknown;
if (AuthSessionChangedError.is(sessionChangedError)) {
  const code: 'auth_session_changed' = sessionChangedError.code;
  const status: 409 = sessionChangedError.status;
  const name: 'AuthSessionChangedError' = sessionChangedError.name;
  void [code, status, name];
}
