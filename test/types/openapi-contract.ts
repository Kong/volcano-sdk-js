import type {
  Auth,
  CompleteSession,
  StorageFileApi,
  CreateUploadSessionResponse,
  OpenAPIComponents,
  OpenAPIOperations,
  QueryBuilder,
  MutationBuilder,
  UploadSessionStatusResponse,
} from '../../src/index.js';
import {
  AuthRefreshDiscardedError,
  AuthSessionChangedError,
  VolcanoSystemError,
} from '../../src/index.js';

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

type ListProjectsQuery = NonNullable<OpenAPIOperations['listProjects']['parameters']['query']>;
type _ListProjectsAcceptsMetadataExpansions = Assert<
  Equal<NonNullable<ListProjectsQuery['include']>[number], 'git_connection' | 'health'>
>;
type Project = OpenAPIComponents['schemas']['Project'];
type _ProjectGitConnectionUsesSummary = Assert<
  Equal<
    NonNullable<Project['git_connection']>,
    OpenAPIComponents['schemas']['ProjectGitConnectionSummary']
  >
>;
type _ProjectHealthUsesSummary = Assert<
  Equal<NonNullable<Project['health']>, OpenAPIComponents['schemas']['ProjectHealthSummary']>
>;

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

type UploadSessionCreated = NonNullable<CreateUploadSessionResponse['data']>;
type UploadSessionCreatedShape = {
  session_id: string;
  part_size: number;
  total_parts: number;
  expires_at: string;
};
type _UploadSessionCreatedMatchesHosting = Assert<
  Equal<UploadSessionCreated, UploadSessionCreatedShape>
>;
type _UploadSessionCreatedKeysMatchOpenAPI = Assert<
  Equal<
    keyof UploadSessionCreated,
    keyof OpenAPIComponents['schemas']['CreateUploadSessionResponse']
  >
>;

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

declare const query: QueryBuilder;
declare const mutation: MutationBuilder;
query.is('deleted_at', null).is('enabled', true).is('enabled', false);
mutation.is('deleted_at', null).is('enabled', true).is('enabled', false);
// @ts-expect-error SQL identity values are native booleans or null, not strings.
query.is('enabled', 'true');
// @ts-expect-error Numeric values require comparison filters.
mutation.is('enabled', 1);

declare const bucket: StorageFileApi;
async function uploadResponseEnvelopes() {
  const completed = await bucket.completeUploadSession('file.bin', 'session');
  const resumed = await bucket.uploadResumable('file.bin', new Blob(['bytes']));
  const uploaded = await bucket.upload('file.bin', new Blob(['bytes']));
  const names: (string | undefined)[] = [
    completed.data?.object.name,
    resumed.data?.object.name,
    uploaded.data?.name,
  ];
  // @ts-expect-error Completion returns an object envelope, not flattened metadata.
  completed.data?.name;
  // @ts-expect-error Resumable upload preserves the completion envelope.
  resumed.data?.name;
  void names;
}
void uploadResponseEnvelopes;

async function storageErrorMetadata() {
  const results = [
    await bucket.upload('file.bin', new Blob(['bytes'])),
    await bucket.download('file.bin'),
    await bucket.list(),
    await bucket.remove(['file.bin']),
    await bucket.move('file.bin', 'moved.bin'),
    await bucket.copy('file.bin', 'copy.bin'),
    await bucket.updateVisibility('file.bin', false),
    await bucket.createUploadSession('file.bin', { totalSize: 5 }),
    await bucket.uploadPart('file.bin', 'session', 1, new Blob(['bytes'])),
    await bucket.getUploadSession('file.bin', 'session'),
    await bucket.completeUploadSession('file.bin', 'session'),
    await bucket.abortUploadSession('file.bin', 'session'),
    await bucket.uploadResumable('file.bin', new Blob(['bytes'])),
  ];
  for (const { error } of results) {
    const status: number | undefined = error?.status;
    const code: string | undefined = error?.code;
    const retryAfter: number | undefined = error?.retryAfter;
    void [status, code, retryAfter];
  }
}
void storageErrorMetadata;

async function removalFailureMetadata() {
  const removed = await bucket.remove(['one.bin', 'two.bin']);
  for (const failure of removed.error?.failures ?? []) {
    const path: string = failure.path;
    const status: number | undefined = failure.error.status;
    void [path, status];
  }
}
void removalFailureMetadata;

async function authErrorMetadata() {
  const responses = [
    await sourceAuth.getUser(),
    await sourceAuth.updateUser({ metadata: {} }),
    await sourceAuth.confirmEmailChange('token'),
    await sourceAuth.cancelEmailChange(),
    await sourceAuth.requestEmailChange('user@example.com'),
    await sourceAuth.getSessions(),
    await sourceAuth.deleteSession('session'),
    await sourceAuth.deleteAllOtherSessions(),
    await sourceAuth.linkOAuthProvider('github'),
    await sourceAuth.unlinkOAuthProvider('github'),
    await sourceAuth.getLinkedOAuthProviders(),
    await sourceAuth.getOAuthProviderToken('github'),
    await sourceAuth.refreshOAuthToken('github'),
    await sourceAuth.callOAuthAPI('github', { endpoint: '/user' }),
  ];
  for (const { error } of responses) {
    const status: number | undefined = error?.status;
    const code: string | undefined = error?.code;
    const retryAfter: number | undefined = error?.retryAfter;
    void [status, code, retryAfter];
  }
}
void authErrorMetadata;

import type { PresenceInfo, PresenceState, RealtimeChannel } from '../../src/realtime.js';
declare const presenceChannel: RealtimeChannel;
function presenceIdentity(state: PresenceState) {
  for (const info of Object.values(state)) {
    const id: string = info.client;
    const user: string | undefined = info.user;
    const connection: Record<string, unknown> | undefined = info.connInfo;
    const subscription: Record<string, unknown> | undefined = info.chanInfo;
    const same: PresenceInfo = info;
    void [id, user, connection, subscription, same];
  }
}
presenceChannel.onPresenceSync(presenceIdentity);
presenceIdentity(presenceChannel.getPresenceState());

import type { PostgresChange } from '../../src/realtime.js';
declare const postgresChange: PostgresChange;
const primaryKey: string | number | undefined = postgresChange.id;
const deliveryMode: 'lightweight' | undefined = postgresChange.mode;
void [primaryKey, deliveryMode];

async function functionErrorMetadata(functions: import('../../src/index.js').Functions) {
  const { error } = await functions.invoke('echo', { value: 'contract' });
  const status: number | null | undefined = error?.status;
  const code: string | undefined = error?.code;
  const retryAfter: number | undefined = error?.retryAfter;
  void [status, code, retryAfter];
  if (VolcanoSystemError.is(error)) {
    const code: string | undefined = error.code;
    const retryAfter: number | undefined = error.retryAfter;
    void [code, retryAfter];
  }
}
void functionErrorMetadata;
