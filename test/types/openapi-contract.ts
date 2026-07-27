import type { OpenAPIComponents, OpenAPIOperations } from '../../src/index.js';

type Assert<T extends true> = T;

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
type _OAuthResponseAcceptsProperties = Assert<
  { login: string } extends OAuthResponse ? true : false
>;

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
