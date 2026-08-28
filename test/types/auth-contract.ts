import type {
  Auth,
  AuthIdentity,
  AuthMethod,
  AuthResponse,
  AuthStateCallback,
  ConvertAnonymousOptions,
  DeleteSessionResponse,
  DeviceAuthorization,
  DeviceVerification,
  DeviceVerificationAction,
  EmailChangeResponse,
  GetSessionsOptions,
  LinkProviderResponse,
  MessageResponse,
  OAuthAPIParams,
  OAuthAPIResponse,
  OAuthProvider,
  OAuthProviderName,
  OAuthTokenResponse,
  PasswordPolicy,
  PlatformToken,
  ResetPasswordOptions,
  SessionResponse,
  SessionsResponse,
  SignInOptions,
  SignUpOptions,
  SignUpResponse,
  User,
  UserMetadata,
  UserResponse,
} from '../../src/index.js';

type Assert<T extends true> = T;
type HasSignature<Actual, Expected> = Actual extends Expected ? true : false;

type _SignUp = Assert<
  HasSignature<Auth['signUp'], (options: SignUpOptions) => Promise<SignUpResponse>>
>;
type _SignIn = Assert<
  HasSignature<Auth['signIn'], (options: SignInOptions) => Promise<AuthResponse>>
>;
type _SignOut = Assert<HasSignature<Auth['signOut'], () => Promise<{ error: Error | null }>>>;
type _GetUser = Assert<HasSignature<Auth['getUser'], () => Promise<UserResponse>>>;
type _UpdateUser = Assert<
  HasSignature<
    Auth['updateUser'],
    (options: { password?: string; metadata?: UserMetadata }) => Promise<UserResponse>
  >
>;
type _RefreshSession = Assert<HasSignature<Auth['refreshSession'], () => Promise<SessionResponse>>>;
type _AuthListener = Assert<
  HasSignature<Auth['onAuthStateChange'], (callback: AuthStateCallback) => () => void>
>;
type _CurrentUser = Assert<HasSignature<Auth['user'], () => User | null>>;
type _AnonymousSignUp = Assert<
  HasSignature<Auth['signUpAnonymous'], (metadata?: UserMetadata) => Promise<AuthResponse>>
>;
type _AnonymousConversion = Assert<
  HasSignature<
    Auth['convertAnonymous'],
    (options: ConvertAnonymousOptions) => Promise<UserResponse>
  >
>;
type _ConfirmEmail = Assert<
  HasSignature<Auth['confirmEmail'], (token: string) => Promise<MessageResponse>>
>;
type _ResendConfirmation = Assert<
  HasSignature<Auth['resendConfirmation'], (email: string) => Promise<MessageResponse>>
>;
type _ForgotPassword = Assert<
  HasSignature<Auth['forgotPassword'], (email: string) => Promise<MessageResponse>>
>;
type _PasswordPolicy = Assert<
  HasSignature<
    Auth['getPasswordPolicy'],
    () => Promise<{ policy: PasswordPolicy | null; error: Error | null }>
  >
>;
type _StartDevice = Assert<
  HasSignature<
    Auth['startDeviceAuthorization'],
    (
      clientId: string,
    ) => Promise<{ authorization: DeviceAuthorization | null; error: Error | null }>
  >
>;
type _PollDevice = Assert<
  HasSignature<
    Auth['pollDeviceToken'],
    (clientId: string, deviceCode: string) => Promise<AuthResponse>
  >
>;
type _VerifyDevice = Assert<
  HasSignature<
    Auth['verifyDevice'],
    (
      userCode: string,
      action?: DeviceVerificationAction,
    ) => Promise<{
      verification: DeviceVerification | null;
      error: Error | null;
    }>
  >
>;
type _ExchangePlatform = Assert<
  HasSignature<
    Auth['exchangePlatformToken'],
    (clientId: string) => Promise<{ token: PlatformToken | null; error: Error | null }>
  >
>;
type _ResetPassword = Assert<
  HasSignature<Auth['resetPassword'], (options: ResetPasswordOptions) => Promise<MessageResponse>>
>;
type _RequestEmailChange = Assert<
  HasSignature<Auth['requestEmailChange'], (newEmail: string) => Promise<EmailChangeResponse>>
>;
type _ConfirmEmailChange = Assert<
  HasSignature<Auth['confirmEmailChange'], (token: string) => Promise<UserResponse>>
>;
type _CancelEmailChange = Assert<
  HasSignature<Auth['cancelEmailChange'], () => Promise<MessageResponse>>
>;
type HostedOptions = { projectId?: string; action?: 'login' | 'signup' | 'forgot-password' };
type _HostedURL = Assert<
  HasSignature<Auth['getHostedAuthUrl'], (options?: HostedOptions) => string>
>;
type _HostedSignIn = Assert<
  HasSignature<Auth['signInWithHostedAuth'], (options?: HostedOptions) => string>
>;
type _OAuthSignIn = Assert<
  HasSignature<
    Auth['signInWithOAuth'],
    (provider: OAuthProviderName, options?: { redirectTo?: string }) => string
  >
>;
type _GoogleShortcut = Assert<HasSignature<Auth['signInWithGoogle'], () => void>>;
type _GitHubShortcut = Assert<HasSignature<Auth['signInWithGitHub'], () => void>>;
type _MicrosoftShortcut = Assert<HasSignature<Auth['signInWithMicrosoft'], () => void>>;
type _AppleShortcut = Assert<HasSignature<Auth['signInWithApple'], () => void>>;
type _LinkProvider = Assert<
  HasSignature<
    Auth['linkOAuthProvider'],
    (
      provider: OAuthProviderName,
    ) => Promise<{ data: LinkProviderResponse | null; error: Error | null }>
  >
>;
type _UnlinkProvider = Assert<
  HasSignature<
    Auth['unlinkOAuthProvider'],
    (provider: OAuthProviderName) => Promise<{ error: Error | null }>
  >
>;
type _LinkedProviders = Assert<
  HasSignature<
    Auth['getLinkedOAuthProviders'],
    () => Promise<{ providers: OAuthProvider[] | null; error: Error | null }>
  >
>;
type _RefreshOAuth = Assert<
  HasSignature<
    Auth['refreshOAuthToken'],
    (provider: OAuthProviderName) => Promise<OAuthTokenResponse>
  >
>;
type _GetOAuthToken = Assert<
  HasSignature<
    Auth['getOAuthProviderToken'],
    (provider: OAuthProviderName) => Promise<OAuthTokenResponse>
  >
>;
type _CallOAuthAPI = Assert<
  HasSignature<
    Auth['callOAuthAPI'],
    (provider: OAuthProviderName, params: OAuthAPIParams) => Promise<OAuthAPIResponse>
  >
>;
type _ListIdentities = Assert<
  HasSignature<
    Auth['listIdentities'],
    () => Promise<{ identities: AuthIdentity[] | null; error: Error | null }>
  >
>;
type _UnlinkIdentity = Assert<
  HasSignature<Auth['unlinkIdentity'], (identityId: string) => Promise<{ error: Error | null }>>
>;
type _ListMethods = Assert<
  HasSignature<
    Auth['listMethods'],
    () => Promise<{ methods: AuthMethod[] | null; error: Error | null }>
  >
>;
type _PromoteMethod = Assert<
  HasSignature<
    Auth['promoteMethod'],
    (methodId: string) => Promise<{ method: AuthMethod | null; error: Error | null }>
  >
>;
type _GetSessions = Assert<
  HasSignature<Auth['getSessions'], (options?: GetSessionsOptions) => Promise<SessionsResponse>>
>;
type _DeleteSession = Assert<
  HasSignature<Auth['deleteSession'], (sessionId: string) => Promise<DeleteSessionResponse>>
>;
type _DeleteOtherSessions = Assert<
  HasSignature<Auth['deleteAllOtherSessions'], () => Promise<DeleteSessionResponse>>
>;
