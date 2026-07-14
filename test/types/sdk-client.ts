import { createVolcanoClient, type VolcanoClientConfig } from '../../src/index.types';
import type {
  AuthSignupData,
  AuthUser,
  CreateProjectRequest,
  FunctionInvocationRequest,
  StorageBucket,
  StorageObject,
} from '../../src/api';

type Assert<T extends true> = T;

const config: VolcanoClientConfig = {
  accessToken: 'access-token',
  anonKey: 'anon-key',
  baseUrl: 'https://api.volcano.dev',
  refreshToken: 'refresh-token',
  serviceRoleKey: 'service-role-key',
  timeoutMs: 60_000,
  userToken: 'user-token',
};

const volcano = createVolcanoClient(config);
void volcano.database('application').from<{ id: string }>('projects').select('id');
void volcano.storage.from('documents').download('nested/path/report.pdf', {
  range: 'bytes=0-1023',
});
void volcano.functions.invoke<{ ok: boolean }>('processor', { action: 'run' });
void volcano.api;

type SignupMetadata = NonNullable<AuthSignupData['body']['user_metadata']>;
type _SignupMetadataAcceptsProperties = Assert<
  { display_name: string } extends SignupMetadata ? true : false
>;
type UserMetadata = NonNullable<AuthUser['user_metadata']>;
type AppMetadata = NonNullable<AuthUser['app_metadata']>;
type _UserMetadataAcceptsProperties = Assert<
  { display_name: string } extends UserMetadata ? true : false
>;
type _AppMetadataAcceptsProperties = Assert<{ role: string } extends AppMetadata ? true : false>;
type _AuthUserBanCanBeNull = Assert<null extends AuthUser['banned_until'] ? true : false>;
type _DefaultedRequestFieldsStayOptional = Assert<
  { name: string } extends CreateProjectRequest ? true : false
>;
type _StorageLimitsCanBeNull = Assert<null extends StorageBucket['file_size_limit'] ? true : false>;
type _StorageMimeTypesCanBeNull = Assert<
  null extends StorageBucket['allowed_mime_types'] ? true : false
>;
type _StorageOwnerCanBeNull = Assert<null extends StorageObject['owner_id'] ? true : false>;
type InvocationPayload = NonNullable<FunctionInvocationRequest['payload']>;
type _InvocationPayloadAcceptsProperties = Assert<
  { action: string } extends InvocationPayload ? true : false
>;
