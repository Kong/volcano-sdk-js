import {
  type Auth,
  AuthRefreshDiscardedError,
  AuthSessionChangedError,
  type CompleteSession,
  type MutationBuilder,
  type OpenAPIComponents,
  type OpenAPIOperations,
  type QueryBuilder,
  VolcanoSystemError,
} from '../../src/index.ts';
import type { PostgresChange, PresenceInfo, PresenceState, RealtimeChannel } from '../../src/realtime.ts';
import type { Exact as Equal } from '../fixtures/public-api-compatibility.d.ts';

type Assert<T extends true> = T;

type SetSessionParameter = Parameters<Auth['setSession']>[0];
type _CompleteSessionCanBeAdopted = Assert<CompleteSession extends SetSessionParameter ? true : false>;
type _SetSessionRejectsNullRefreshToken = Assert<null extends SetSessionParameter['refresh_token'] ? false : true>;
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
type _SignupMetadataAcceptsProperties = Assert<{ display_name: string } extends SignupMetadata ? true : false>;

type AuthUser = OpenAPIComponents['schemas']['AuthUser'];
type UserMetadata = NonNullable<AuthUser['user_metadata']>;
type AppMetadata = NonNullable<AuthUser['app_metadata']>;
type _UserMetadataAcceptsProperties = Assert<{ display_name: string } extends UserMetadata ? true : false>;
type _AppMetadataAcceptsProperties = Assert<{ role: string } extends AppMetadata ? true : false>;
type _AuthUserBanCanBeNull = Assert<null extends AuthUser['banned_until'] ? true : false>;

type ListProjectsQuery = NonNullable<OpenAPIOperations['listProjects']['parameters']['query']>;
type _ListProjectsAcceptsMetadataExpansions = Assert<
  Equal<NonNullable<ListProjectsQuery['include']>[number], 'git_connection' | 'health'>
>;
type Project = OpenAPIComponents['schemas']['Project'];
type _ProjectPlanUsesPublicNames = Assert<Equal<NonNullable<Project['plan']>, 'HOBBY' | 'SUPERAGENT'>>;
type _ProjectGitConnectionUsesSummary = Assert<
  Equal<NonNullable<Project['git_connection']>, OpenAPIComponents['schemas']['ProjectGitConnectionSummary']>
>;
type _ProjectHealthUsesSummary = Assert<
  Equal<NonNullable<Project['health']>, OpenAPIComponents['schemas']['ProjectHealthSummary']>
>;

type CreateProjectRequest = OpenAPIComponents['schemas']['CreateProjectRequest'];
type _DefaultedRequestFieldsStayOptional = Assert<{ name: string } extends CreateProjectRequest ? true : false>;

type InvocationPayload = NonNullable<OpenAPIComponents['schemas']['FunctionInvocationRequest']['payload']>;
type _InvocationPayloadAcceptsProperties = Assert<{ action: string } extends InvocationPayload ? true : false>;

type OAuthRequest = OpenAPIOperations['callOAuthProviderAPI']['requestBody']['content']['application/json'];
type OAuthBody = NonNullable<OAuthRequest['body']>;
type OAuthResponse = OpenAPIOperations['callOAuthProviderAPI']['responses'][200]['content']['application/json'];
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
type _LogSearchEventBodyKeepsJsonTypes = Assert<LogSearchEventStructuredShape extends LogSearchEvent ? true : false>;

export type OpenApiContractChecks = [
  _CompleteSessionCanBeAdopted,
  _SetSessionRejectsNullRefreshToken,
  _SetSessionRejectsNullUser,
  _SignupMetadataAcceptsProperties,
  _UserMetadataAcceptsProperties,
  _AppMetadataAcceptsProperties,
  _AuthUserBanCanBeNull,
  _ListProjectsAcceptsMetadataExpansions,
  _ProjectPlanUsesPublicNames,
  _ProjectGitConnectionUsesSummary,
  _ProjectHealthUsesSummary,
  _DefaultedRequestFieldsStayOptional,
  _InvocationPayloadAcceptsProperties,
  _OAuthBodyAcceptsProperties,
  _OAuthResponseUsesHostingEnvelope,
  _LogSearchEventIsUsable,
  _LogSearchEventBodyKeepsJsonTypes,
];

declare const refreshError: unknown;
let refreshErrorFields: ['auth_refresh_discarded', 409, 'AuthRefreshDiscardedError'] | undefined;
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

async function functionErrorMetadata(functions: import('../../src/index.ts').Functions): Promise<unknown> {
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
  authErrorMetadata,
  presenceIdentity,
  functionErrorMetadata,
};
