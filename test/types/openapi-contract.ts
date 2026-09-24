import {
  type Auth,
  AuthRefreshDiscardedError,
  AuthSessionChangedError,
  type CompleteSession,
  type CreateUploadSessionResponse,
  type Durable,
  type DurableExecution,
  type MutationBuilder,
  type OpenAPIComponents,
  type OpenAPIOperations,
  type QueryBuilder,
  type StorageFileApi,
  type UploadSessionStatusResponse,
  VolcanoSystemError,
} from '../../src/index.ts';
import type { PostgresChange, PresenceInfo, PresenceState, RealtimeChannel } from '../../src/realtime.ts';

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

async function adoptCurrentSession(): Promise<unknown> {
  const {
    data: { session },
  } = await sourceAuth.getSession();
  if (session === null) {
    return;
  }
  if (session.refresh_token === null || session.refresh_token === '' || session.user === null) {
    return;
  }
  return targetAuth.setSession({
    ...session,
    refresh_token: session.refresh_token,
    user: session.user,
  });
}


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
interface UploadSessionCreatedShape {
  session_id: string;
  part_size: number;
  total_parts: number;
  expires_at: string;
}
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
interface UploadSessionStatusShape {
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
}
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
interface OAuthResponseShape {
  provider: 'google' | 'github' | 'microsoft' | 'apple';
  endpoint: string;
  status_code: number;
  // Whatever JSON value the provider sent, or null when it sent no body. Not
  // narrowed to an object: hosting passes the decoded value through, so an
  // endpoint that answers with an array or a scalar reaches the caller as one.
  // A body hosting cannot decode is a 502 and never arrives here.
  data: unknown;
}
type _OAuthResponseUsesHostingEnvelope = Assert<Equal<OAuthResponse, OAuthResponseShape>>;

interface DurableExecutionShape {
  id: string;
  function_id: string;
  name: string;
  // `unknown` is a terminal status the platform writes itself, for an execution
  // whose outcome it could not find out. Listed here because the handle a start
  // returns can carry it on a later read.
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'stopped' | 'unknown';
  region: string;
  created_at: string;
}
type _DurableStartHandleMatchesHosting = Assert<
  DurableExecutionShape extends DurableExecution ? true : false
>;
type _DurableExecutionComesOffTheWire = Assert<
  Equal<DurableExecution, OpenAPIComponents['schemas']['DurableExecution']>
>;

declare const durable: Durable;

// A start is answered, never thrown: `error` is what a refusal arrives as, and
// `data` is only a handle once it is null-checked.
async function startDurableExecution(): Promise<unknown> {
  const { data, status, error } = await durable.start('order-pipeline', { order_id: 4417 });
  if (error !== null) {
    const refusal: number | null = status;
    return refusal;
  }
  const handle: DurableExecution | null = data;
  return handle;
}


// The owner-scoped half: reading, listing and stopping all answer the same
// envelope, and a page carries the executions rather than a bare array.
async function followDurableExecution(): Promise<unknown> {
  const read = await durable.get('proj-1', 'order-pipeline', 'exec-1');
  const result: DurableExecution | null = read.data;

  const listed = await durable.list('proj-1', 'order-pipeline', { status: 'running', limit: 20 });
  const executions: DurableExecution[] = listed.data?.data ?? [];
  const more: boolean = listed.data?.has_more ?? false;

  const stopped = await durable.stop('proj-1', 'order-pipeline', 'exec-1');
  return { result, executions, more, status: stopped.status };
}


type LogSearchEvent = OpenAPIComponents['schemas']['LogSearchEvent'];
interface LogSearchEventShape {
  id: string;
  timestamp: string;
  body: string;
  resource: OpenAPIComponents['schemas']['LogResource'];
}
type _LogSearchEventIsUsable = Assert<LogSearchEventShape extends LogSearchEvent ? true : false>;
type LogSearchEventStructuredShape = Omit<LogSearchEventShape, 'body'> & {
  body: { attempt: number };
};
type _LogSearchEventBodyKeepsJsonTypes = Assert<
  LogSearchEventStructuredShape extends LogSearchEvent ? true : false
>;

export type OpenApiContractChecks = [
  _CompleteSessionCanBeAdopted,
  _SetSessionRejectsNullRefreshToken,
  _SetSessionRejectsNullUser,
  _SignupMetadataAcceptsProperties,
  _UserMetadataAcceptsProperties,
  _AppMetadataAcceptsProperties,
  _AuthUserBanCanBeNull,
  _ListProjectsAcceptsMetadataExpansions,
  _ProjectGitConnectionUsesSummary,
  _ProjectHealthUsesSummary,
  _DefaultedRequestFieldsStayOptional,
  _StorageLimitsCanBeNull,
  _StorageMimeTypesCanBeNull,
  _StorageOwnerCanBeNull,
  _UploadSessionCreatedMatchesHosting,
  _UploadSessionCreatedKeysMatchOpenAPI,
  _UploadSessionStatusMatchesHosting,
  _InvocationPayloadAcceptsProperties,
  _OAuthBodyAcceptsProperties,
  _OAuthResponseUsesHostingEnvelope,
  _DurableStartHandleMatchesHosting,
  _DurableExecutionComesOffTheWire,
  _LogSearchEventIsUsable,
  _LogSearchEventBodyKeepsJsonTypes,
];

declare const refreshError: unknown;
let refreshErrorFields:
  | ['auth_refresh_discarded', 409, 'AuthRefreshDiscardedError']
  | undefined;
if (AuthRefreshDiscardedError.is(refreshError)) {
  const code: 'auth_refresh_discarded' = refreshError.code;
  const status: 409 = refreshError.status;
  const name: 'AuthRefreshDiscardedError' = refreshError.name;
  refreshErrorFields = [code, status, name];
}
export { refreshErrorFields };

declare const sessionChangedError: unknown;
let sessionErrorFields: ['auth_session_changed', 409, 'AuthSessionChangedError'] | undefined;
if (AuthSessionChangedError.is(sessionChangedError)) {
  const code: 'auth_session_changed' = sessionChangedError.code;
  const status: 409 = sessionChangedError.status;
  const name: 'AuthSessionChangedError' = sessionChangedError.name;
  sessionErrorFields = [code, status, name];
}
export { sessionErrorFields };

declare const query: QueryBuilder;
declare const mutation: MutationBuilder;
query.is('deleted_at', null).is('enabled', true).is('enabled', false);
mutation.is('deleted_at', null).is('enabled', true).is('enabled', false);
// @ts-expect-error SQL identity values are native booleans or null, not strings.
query.is('enabled', 'true');
// @ts-expect-error Numeric values require comparison filters.
mutation.is('enabled', 1);

declare const bucket: StorageFileApi;
async function uploadResponseEnvelopes(): Promise<unknown> {
  const completed = await bucket.completeUploadSession('file.bin', 'session');
  const resumed = await bucket.uploadResumable('file.bin', new Blob(['bytes']));
  const uploaded = await bucket.upload('file.bin', new Blob(['bytes']));
  const names: (string | undefined)[] = [
    completed.data?.object.name,
    resumed.data?.object.name,
    uploaded.data?.name,
  ];
  return names;
}

async function rejectFlattenedUploadResponses(): Promise<unknown> {
  const completed = await bucket.completeUploadSession('file.bin', 'session');
  const resumed = await bucket.uploadResumable('file.bin', new Blob(['bytes']));
  // @ts-expect-error Completion returns an object envelope, not flattened metadata.
  const completedName: unknown = completed.data?.name;
  // @ts-expect-error Resumable upload preserves the completion envelope.
  const resumedName: unknown = resumed.data?.name;
  return [completedName, resumedName];
}

async function storageErrorMetadata(): Promise<unknown> {
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
  return results.map(({ error }) => {
    const status: number | undefined = error?.status;
    const code: string | undefined = error?.code;
    const retryAfter: number | undefined = error?.retryAfter;
    return [status, code, retryAfter];
  });
}

async function removalFailureMetadata(): Promise<unknown> {
  const removed = await bucket.remove(['one.bin', 'two.bin']);
  return (removed.error?.failures ?? []).map((failure) => {
    const path: string = failure.path;
    const status: number | undefined = failure.error.status;
    return [path, status];
  });
}

async function authErrorMetadata(): Promise<unknown> {
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
  return responses.map(({ error }) => {
    const status: number | undefined = error?.status;
    const code: string | undefined = error?.code;
    const retryAfter: number | undefined = error?.retryAfter;
    return [status, code, retryAfter];
  });
}

declare const presenceChannel: RealtimeChannel;
function presenceIdentity(state: PresenceState): unknown {
  return Object.values(state).map((info) => {
    const id: string = info.client;
    const user: string | undefined = info.user;
    const connection: Record<string, unknown> | undefined = info.connInfo;
    const subscription: Record<string, unknown> | undefined = info.chanInfo;
    const same: PresenceInfo = info;
    return [id, user, connection, subscription, same];
  });
}
presenceChannel.onPresenceSync(presenceIdentity);
presenceIdentity(presenceChannel.getPresenceState());

declare const postgresChange: PostgresChange;
const primaryKey: string | number | undefined = postgresChange.id;
const deliveryMode: 'lightweight' | undefined = postgresChange.mode;
export const changeFields = [primaryKey, deliveryMode];

async function functionErrorMetadata(
  functions: import('../../src/index.ts').Functions,
): Promise<unknown> {
  const { error } = await functions.invoke('echo', { value: 'contract' });
  const status: number | null | undefined = error?.status;
  const code: string | undefined = error?.code;
  const retryAfter: number | undefined = error?.retryAfter;
  let systemFields: [string | undefined, number | undefined] | undefined;
  if (VolcanoSystemError.is(error)) {
    systemFields = [error.code, error.retryAfter];
  }
  return { status, code, retryAfter, systemFields };
}

export const contractOperations = {
  adoptCurrentSession,
  startDurableExecution,
  followDurableExecution,
  uploadResponseEnvelopes,
  rejectFlattenedUploadResponses,
  storageErrorMetadata,
  removalFailureMetadata,
  authErrorMetadata,
  presenceIdentity,
  functionErrorMetadata,
};
