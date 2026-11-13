/* oxlint-disable eslint/max-lines -- Keep the closed historical type graph together; native consumer checks verify every entry. */
// Source compatibility for the public OpenAPI aliases at 8dc3d45da48957405045a88eea8cfd78de7b2468.
// Baseline src/generated/openapi.d.ts SHA-256: 81c90f85ad9dd9fc2cd9327c8a1f1cf1e1530a5d49c04398368565567f6ce5fd.
// Historical declarations do not restore routes or promise current server behavior.
// New and unaffected entries retain the current generator's lexical references.
import type {
  components as CurrentComponents,
  operations as CurrentOperations,
  paths as CurrentPaths,
} from './generated/openapi';

interface HistoricalSchemas {
  SandboxSession: {
    id: string;
    project_id: string;
    sandbox_id: string | null;
    state: 'starting' | 'running' | 'suspending' | 'suspended' | 'resuming' | 'terminating' | 'terminated' | 'unknown';
    desired_state: 'running' | 'suspended' | 'terminated';
    region: string;
    memory_mb: number;
    created_at: string;
    started_at?: string;
    expires_at: string | null;
  };
  CreateSandboxSessionRequest: {
    preset?: string;
    sandbox_id?: string;
    memory_mb?: 1024 | 2048;
    region: string;
    max_duration_seconds?: number;
  };
  SandboxCommandRequest: {
    command: string;
    timeout_seconds?: number;
    environment?: {
      [key: string]: string;
    };
  };
  SandboxExecutionRequest: {
    preset?: string;
    sandbox_id?: string;
    memory_mb?: 1024 | 2048;
    region: string;
    max_duration_seconds?: number;
    command: string;
    timeout_seconds?: number;
    environment?: {
      [key: string]: string;
    };
  };
  SandboxCommandResult: {
    stdout: string;
    stderr: string;
    exit_code: number;
    stdout_truncated: boolean;
    stderr_truncated: boolean;
    timed_out: boolean;
  };
  SandboxExecutionResult: {
    stdout: string;
    stderr: string;
    exit_code: number;
    stdout_truncated: boolean;
    stderr_truncated: boolean;
    timed_out: boolean;
    session_id: string;
    region: string;
    duration_ms: number;
  };
  SandboxSessionPage: {
    data: components['schemas']['SandboxSession'][];
    pagination: components['schemas']['SandboxPagination'];
  };
  Capability: {
    id: string;
    status: components['schemas']['CapabilityStatus'];
  };
  CapabilityStatus: 'available' | 'unavailable';
  CapabilityList: {
    data: components['schemas']['Capability'][];
  };
  AuthConfig: {
    project_id?: string;
    access_token_lifetime?: number;
    refresh_token_lifetime?: number;
    refresh_token_reuse_interval?: number;
    inactivity_timeout?: number;
    max_session_duration?: number;
    min_password_length?: number;
    password_policy: components['schemas']['AuthPasswordPolicy'];
    require_uppercase?: boolean;
    require_lowercase?: boolean;
    require_numbers?: boolean;
    require_special_chars?: boolean;
    enable_signup?: boolean;
    enable_email_password?: boolean;
    rate_limit_signup?: number;
    rate_limit_signin?: number;
    rate_limit_token_refresh?: number;
    rate_limit_password_reset?: number;
    cors_enabled?: boolean;
    cors_allowed_origins?: string[];
    enable_anonymous_signins?: boolean;
    allowed_email_domains?: string[];
    allowed_email_domains_mode?: 'disabled' | 'signup' | 'signup_and_signin';
    platform_token_ttl?: number;
    allow_password_reset?: boolean;
    password_reset_timeout?: number;
    max_password_history?: number;
    cors_allow_credentials?: boolean;
    cors_max_age?: number;
    require_email_confirmation?: boolean;
    email_confirmation_timeout?: number;
    auto_link_verified_oauth?: boolean;
    email_enabled?: boolean;
    email_from_address?: string;
    email_from_name?: string;
    smtp_host?: string;
    smtp_port?: number;
    smtp_username?: string;
    smtp_password_configured?: boolean;
    smtp_use_tls?: boolean;
    email_confirmation_subject?: string;
    email_password_reset_subject?: string;
    email_password_changed_subject?: string;
    managed_auth_enabled?: boolean;
    post_auth_redirect_url?: string;
    allowed_redirect_urls?: string[];
    post_logout_redirect_url?: string;
    device_verification_url?: string;
    created_at?: string;
    updated_at?: string;
  };
  BatchFunctionDeployResponse: {
    batch_id: string;
    data: components['schemas']['Function'][];
    failed?: components['schemas']['BatchFunctionDeployFailure'][];
  };
  DatabaseBackup: {
    name: string;
    source: 'manual' | 'scheduled';
    size_bytes?: number;
    expires_at?: string;
    created_at: string;
  };
  DatabaseBackupList: {
    data: components['schemas']['DatabaseBackup'][];
    restore_window?: components['schemas']['DatabaseRestoreWindow'];
  };
  EmailTemplate: {
    id?: string;
    project_id?: string;
    template_type: 'welcome' | 'confirmation' | 'password_reset' | 'password_changed';
    subject: string;
    html_body: string;
    text_body: string;
    created_at?: string;
    updated_at?: string;
  };
  GitRepository: {
    id: number;
    full_name: string;
    default_branch: string;
    private: boolean;
    is_empty: boolean;
  };
  GitRepositoriesResponse: {
    repositories: components['schemas']['GitRepository'][];
  };
  ProjectGitConnection: {
    repo_installation_id: number;
    repo_id: number;
    repo_full_name: string;
    root_directory: string;
    production_branch: string;
    updated_at: string;
  };
  ProjectGitDeploySettings: {
    auto_deploy_enabled: boolean;
    deploy_functions: boolean;
    frontend_name?: string;
    frontend_app_root?: string;
    updated_at: string;
  };
  UpdateProjectGitDeploySettingsRequest: {
    auto_deploy_enabled: boolean;
    deploy_functions: boolean;
    frontend_name?: string;
    frontend_app_root?: string;
  };
  ExportProjectSourceRequest: {
    production_branch: string;
  };
  Frontend: {
    variable_scope?: 'all' | 'shared' | 'scoped';
    declared_variables?: string[];
    id: string;
    project_id: string;
    name: string;
    framework: 'nextjs';
    app_root?: string;
    status: 'provisioning' | 'active' | 'degraded' | 'failed' | 'deleting';
    provisioning_started_at?: string;
    deployed_regions: string[];
    current_deployment_id?: string;
    pending_deployment_id?: string;
    site_url?: string;
    custom_domain?: string;
    custom_domain_status?: 'pending_verification' | 'provisioning' | 'active' | 'detaching' | 'failed' | 'deleted';
    function_routes: components['schemas']['FrontendFunctionRoute'][];
    frontend_routes: components['schemas']['FrontendRoute'][];
    last_deployed_at?: string;
    last_invoked_at?: string;
    created_at: string;
    updated_at: string;
  };
  FrontendDeployment: {
    id: string;
    frontend_id: string;
    project_id: string;
    operation: 'deploy' | 'redeploy' | 'delete';
    status: 'queued' | 'provisioning' | 'active' | 'degraded' | 'failed' | 'superseded' | 'deleting' | 'deleted';
    deploy_source: 'git' | 'cli' | 'web' | 'api' | 'system' | 'unknown';
    initiated_by?: string;
    source_deployment_id?: string;
    site_url?: string;
    build_duration_seconds?: number;
    build_count?: number;
    build_duration_recorded_at?: string;
    progress?: components['schemas']['DeploymentProgress'];
    error_message?: string;
    created_at: string;
    updated_at: string;
  };
  Function: {
    id: string;
    project_id: string;
    name: string;
    status: 'provisioning' | 'active' | 'failed' | 'deleting';
    provisioning_started_at?: string;
    visibility: components['schemas']['FunctionVisibility'];
    is_public: boolean;
    invocation_mode: components['schemas']['FunctionInvocationMode'];
    http_auth_mode: components['schemas']['FunctionHTTPAuthMode'];
    openapi_spec: {
      [key: string]: unknown;
    } | null;
    has_openapi_spec: boolean;
    invoke_url?: string;
    deployed_regions: string[];
    runtime?: string;
    handler?: string;
    current_deployment_id?: string;
    pending_deployment_id?: string;
    last_invoked_at?: string;
    created_at: string;
    updated_at: string;
  };
  FunctionDeployment: {
    id: string;
    function_id: string;
    project_id: string;
    batch_id?: string;
    operation: 'deploy' | 'update' | 'delete';
    status: 'queued' | 'provisioning' | 'active' | 'failed' | 'superseded' | 'deleting' | 'deleted';
    deploy_source: 'git' | 'cli' | 'web' | 'api' | 'system' | 'unknown';
    initiated_by?: string;
    build_duration_seconds?: number;
    build_count?: number;
    build_duration_recorded_at?: string;
    progress?: components['schemas']['DeploymentProgress'];
    error_message?: string;
    completed_at?: string;
    created_at: string;
    updated_at: string;
  };
  PaginatedFrontendDeployments: {
    data: components['schemas']['FrontendDeployment'][];
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
    next?: string;
  };
  PaginatedFrontends: {
    data: components['schemas']['Frontend'][];
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
    next?: string;
    next_cursor?: string;
    prev_cursor?: string;
  };
  PaginatedFunctionDeployments: {
    data: components['schemas']['FunctionDeployment'][];
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
    next?: string;
  };
  PaginatedFunctions: {
    data: components['schemas']['Function'][];
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
    next?: string;
    next_cursor?: string;
    prev_cursor?: string;
  };
  Issue: {
    id: string;
    project_id: string;
    resource: components['schemas']['ResourceReference'];
    title: string;
    error_type?: string;
    culprit?: string;
    status: components['schemas']['IssueStatus'];
    event_count: number;
    first_seen_at: string;
    last_seen_at: string;
    last_region?: string;
    sample_event_id?: string;
    sample_event_at?: string;
    resolved_at?: string;
    regressed_at?: string;
    created_at: string;
    updated_at: string;
  };
  PaginatedIssues: {
    data: components['schemas']['Issue'][];
    limit: number;
    has_more: boolean;
    next_cursor?: string;
  };
  AutofixSettings: {
    project_id: string;
    enabled: boolean;
    max_stage: components['schemas']['AutofixStage'];
    auto_trigger: boolean;
    plan_includes_autofix?: boolean;
    updated_at?: string;
  };
  AutofixStage: 'diagnose' | 'pull_request';
  UpdateAutofixSettingsRequest: {
    enabled: boolean;
    max_stage?: components['schemas']['AutofixStage'];
    auto_trigger?: boolean;
  };
  AutofixRunStatus: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  AutofixRunTrigger: 'manual' | 'new_issue' | 'regression';
  AutofixEvidence: {
    kind: 'log' | 'code' | 'other';
    detail: string;
    location?: string;
  };
  AutofixDiagnosis: {
    summary: string;
    root_cause: string;
    evidence: components['schemas']['AutofixEvidence'][];
    suggested_fix: string;
    confidence: 'low' | 'medium' | 'high';
    fixable: boolean;
    files: string[];
  };
  AutofixEdit: {
    path: string;
    old_text: string;
    new_text: string;
  };
  AutofixPatch: {
    title: string;
    edits: components['schemas']['AutofixEdit'][];
  };
  AutofixPullRequestState: 'open' | 'merged' | 'closed';
  AutofixPullRequest: {
    number: number;
    url: string;
    branch: string;
    state: components['schemas']['AutofixPullRequestState'];
    closed_at?: string;
    deployed_at?: string;
  };
  AutofixPullRequestSkipped:
    | 'source_unavailable'
    | 'pull_request_open'
    | 'not_fixable'
    | 'low_confidence'
    | 'no_patch'
    | 'permission_missing'
    | 'repository_changed'
    | 'publish_failed';
  AutofixRun: {
    id: string;
    project_id: string;
    issue_id: string;
    trigger: components['schemas']['AutofixRunTrigger'];
    status: components['schemas']['AutofixRunStatus'];
    max_stage: components['schemas']['AutofixStage'];
    stage_reached?: components['schemas']['AutofixStage'];
    diagnosis?: components['schemas']['AutofixDiagnosis'];
    patch?: components['schemas']['AutofixPatch'];
    pull_request?: components['schemas']['AutofixPullRequest'];
    pull_request_skipped?: components['schemas']['AutofixPullRequestSkipped'];
    commit_sha?: string;
    failure_code?: string;
    failure_message?: string;
    created_at: string;
    started_at?: string;
    completed_at?: string;
  };
  PaginatedAutofixRuns: {
    data: components['schemas']['AutofixRun'][];
    limit: number;
    has_more: boolean;
    next_cursor?: string;
  };
  PaginatedProjectDeployments: {
    data: components['schemas']['ProjectDeployment'][];
    page?: number;
    limit: number;
    total: number;
    has_more: boolean;
    next?: string;
    next_cursor?: string;
    prev_cursor?: string;
  };
  PaginatedProjects: {
    data: components['schemas']['Project'][];
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
    next?: string;
    next_cursor?: string;
    prev_cursor?: string;
    status?: 'provisioning' | 'active' | 'failed';
    current_sync_id?: string;
    provisioning_started_at?: string;
  };
  Project: {
    template_installation?: components['schemas']['ProjectTemplateInstallation'];
    id: string;
    name: string;
    status: 'active' | 'deleting' | 'failed';
    plan?: 'HOBBY' | 'SUPERAGENT';
    all_regions: boolean;
    selected_regions: string[];
    last_invoked_at?: string;
    logo_url?: string;
    git_connection?: components['schemas']['ProjectGitConnectionSummary'];
    health?: components['schemas']['ProjectHealthSummary'];
    created_at: string;
    updated_at: string;
  };
  ProjectConfig: {
    version: 1;
    project?: components['schemas']['ProjectConfigProject'];
    databases?: components['schemas']['ProjectConfigDatabase'][];
    shared_variables?: string[];
    frontend_shared_variables?: string[];
    variables?: components['schemas']['ProjectConfigVariable'][];
    buckets?: components['schemas']['ProjectConfigBucket'][];
    realtime?: components['schemas']['ProjectConfigRealtime'];
    autofix?: components['schemas']['ProjectConfigAutofix'];
    notifications?: components['schemas']['ProjectConfigNotifications'];
    auth?: components['schemas']['ProjectConfigAuth'];
    functions?: components['schemas']['ProjectConfigFunction'][];
    frontends?: components['schemas']['ProjectConfigFrontend'][];
    sandboxes?: components['schemas']['ProjectConfigSandbox'][];
  };
  ProjectConfigApplyResult: {
    dry_run?: boolean;
    results: components['schemas']['ProjectConfigApplyResultEntry'][];
    skipped: components['schemas']['ProjectConfigSkippedResource'][];
    missing: components['schemas']['ProjectConfigMissingResource'][];
    summary: components['schemas']['ProjectConfigApplySummary'];
  };
  ProjectConfigApplyResultEntry: {
    section: string;
    name?: string;
    action: 'created' | 'updated' | 'deleted' | 'unchanged' | 'error';
    error?: string;
    notice?: string;
  };
  ProjectConfigAuth: {
    tokens?: components['schemas']['ProjectConfigAuthTokens'];
    sessions?: components['schemas']['ProjectConfigAuthSessions'];
    signup?: components['schemas']['ProjectConfigAuthSignup'];
    rate_limits?: components['schemas']['ProjectConfigAuthRateLimits'];
    password?: components['schemas']['ProjectConfigAuthPassword'];
    password_reset?: components['schemas']['ProjectConfigAuthPasswordReset'];
    email_verification?: components['schemas']['ProjectConfigAuthEmailVerification'];
    cors?: components['schemas']['ProjectConfigAuthCORS'];
    providers?: components['schemas']['ProjectConfigAuthProviders'];
    email?: components['schemas']['ProjectConfigAuthEmail'];
    managed_pages?: components['schemas']['ProjectConfigAuthManagedPages'];
  };
  ProjectConfigAuthCORS: {
    enabled?: boolean;
    allowed_origins?: string[];
    allow_credentials?: boolean;
    max_age?: number;
  };
  ProjectConfigAutofix: {
    enabled?: boolean;
    max_stage?: components['schemas']['AutofixStage'];
    auto_trigger?: boolean;
  };
  ProjectDeployment: {
    id: string;
    project_id: string;
    resource: components['schemas']['ProjectDeploymentResource'];
    operation: 'deploy' | 'redeploy' | 'update' | 'delete';
    status: 'queued' | 'provisioning' | 'active' | 'degraded' | 'failed' | 'superseded' | 'deleting' | 'deleted';
    deploy_source: 'git' | 'cli' | 'web' | 'api' | 'system' | 'unknown';
    error_message?: string;
    completed_at?: string;
    progress?: components['schemas']['DeploymentProgress'];
    created_at: string;
    updated_at: string;
  };
  UpdateAuthConfigRequest: {
    access_token_lifetime?: number;
    refresh_token_lifetime?: number;
    refresh_token_reuse_interval?: number;
    inactivity_timeout?: number;
    max_session_duration?: number;
    platform_token_ttl?: number;
    min_password_length?: number;
    require_uppercase?: boolean;
    require_lowercase?: boolean;
    require_numbers?: boolean;
    require_special_chars?: boolean;
    enable_signup?: boolean;
    enable_email_password?: boolean;
    rate_limit_signup?: number;
    rate_limit_signin?: number;
    rate_limit_token_refresh?: number;
    rate_limit_password_reset?: number;
    cors_enabled?: boolean;
    cors_allowed_origins?: string[];
    cors_allow_credentials?: boolean;
    cors_max_age?: number;
    enable_anonymous_signins?: boolean;
    allowed_email_domains?: string[];
    allowed_email_domains_mode?: 'disabled' | 'signup' | 'signup_and_signin';
    allow_password_reset?: boolean;
    password_reset_timeout?: number;
    max_password_history?: number;
    require_email_confirmation?: boolean;
    email_confirmation_timeout?: number;
    auto_link_verified_oauth?: boolean;
    email_enabled?: boolean;
    email_from_address?: string;
    email_from_name?: string;
    smtp_host?: string;
    smtp_port?: number;
    smtp_username?: string;
    smtp_password?: string;
    smtp_use_tls?: boolean;
    email_confirmation_subject?: string;
    email_password_reset_subject?: string;
    email_password_changed_subject?: string;
    managed_auth_enabled?: boolean;
    post_auth_redirect_url?: string;
    allowed_redirect_urls?: string[];
    post_logout_redirect_url?: string;
    device_verification_url?: string;
  };
  ProjectTemplateInstallation: {
    status: 'pending' | 'running' | 'ready' | 'failed';
    phase: 'database' | 'restore' | 'configure' | 'deploy' | 'verify' | 'ready';
  };
}

interface HistoricalParameters {
  AutofixRunId: string;
}

interface HistoricalOperations {
  listSandboxSessions: {
    parameters: {
      query?: {
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
      };
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxSessionPage'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createSandboxSession: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateSandboxSessionRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxSession'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  executeSandbox: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SandboxExecutionRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxExecutionResult'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getSandboxSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxSession'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  terminateSandboxSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxSession'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  suspendSandboxSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxSession'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  resumeSandboxSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxSession'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  executeSandboxSession: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SandboxCommandRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxCommandResult'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listGitInstallationRepositories: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        connectionId: string;
        installationId: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GitRepositoriesResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  gitConnectCallback: {
    parameters: {
      query: {
        code?: string;
        state: string;
        error?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      303: {
        headers: {
          Location?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listProjects: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
        include?: ('git_connection' | 'health')[];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedProjects'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createProject: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateProjectRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Project'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Project'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateProjectRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Project'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  uploadProjectLogo: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': {
          logo: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Project'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteProjectLogo: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Project'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  replaceSharedVariables: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          shared_variables: string[];
          expected_shared_variables?: string[];
          expected_shared_variables_digest?: string;
        };
      };
    };
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectConfig: {
    parameters: {
      query?: {
        format?: 'json' | 'yaml';
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectConfig'];
          'application/yaml': string;
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  applyProjectConfig: {
    parameters: {
      query?: {
        dry_run?: boolean;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProjectConfig'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectConfigApplyResult'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectConfigValidationErrorResponse'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  exportProjectSource: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ExportProjectSourceRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectSourceExport'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  setProjectGitProductionBranch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SetProjectGitProductionBranchRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectGitConnection'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  setProjectGitRootDirectory: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SetProjectGitRootDirectoryRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectGitConnection'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectGitConnection: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectGitConnection'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  connectProjectGit: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConnectProjectGitRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectGitConnection'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectGitDeploySettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectGitDeploySettings'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateProjectGitDeploySettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateProjectGitDeploySettingsRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectGitDeploySettings'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDeployments: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        owner_id?: components['parameters']['DeploymentOwnerId'];
        project_id?: string;
        created_after?: string;
        resource_type?: components['parameters']['DeploymentResourceType'];
        status?: components['parameters']['DeploymentStatus'];
        operation?: components['parameters']['DeploymentOperation'];
        order?: components['parameters']['DeploymentOrder'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedProjectDeployments'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listProjectDeployments: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
        created_after?: string;
        resource_type?: 'function' | 'frontend';
        function_kind?: components['parameters']['FunctionKindFilter'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedProjectDeployments'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listFunctions: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedFunctions'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createFunction: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': {
          name: string;
          code: string;
          runtime:
            | 'nodejs22.x'
            | 'nodejs24.x'
            | 'python3.10'
            | 'python3.11'
            | 'python3.12'
            | 'python3.13'
            | 'python3.14'
            | 'ruby3.3'
            | 'ruby3.4'
            | 'ruby4.0';
          handler?: string;
          visibility?: components['schemas']['FunctionVisibility'];
          is_public?: boolean;
          invocation_mode?: components['schemas']['FunctionInvocationMode'];
          http_auth_mode?: components['schemas']['FunctionHTTPAuthMode'];
          openapi_spec?: string;
          variable_scope?: 'all' | 'scoped';
          variables?: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Function'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Function'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getFunction: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['FunctionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Function'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateFunction: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['FunctionId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateFunctionRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Function'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createFunctionsBatch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': {
          functions: string;
          code_0?: string;
        };
      };
    };
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BatchFunctionDeployResponse'];
        };
      };
      207: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BatchFunctionDeployResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listFunctionDeployments: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['FunctionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedFunctionDeployments'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDurableFunctionDeployments: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedFunctionDeployments'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listIssues: {
    parameters: {
      query?: {
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['IssueCursor'];
        status?: components['schemas']['IssueStatus'];
        resource_id?: string;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedIssues'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getIssue: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        issueId: components['parameters']['IssueId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Issue'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateIssue: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        issueId: components['parameters']['IssueId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateIssueRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Issue'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getAutofixSettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AutofixSettings'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateAutofixSettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateAutofixSettingsRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AutofixSettings'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  startAutofixRun: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        issueId: components['parameters']['IssueId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AutofixRun'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listAutofixRuns: {
    parameters: {
      query?: {
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['IssueCursor'];
        issue_id?: string;
        status?: components['schemas']['AutofixRunStatus'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedAutofixRuns'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getAutofixRun: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        runId: components['parameters']['AutofixRunId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AutofixRun'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listFrontends: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedFrontends'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createFrontend: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': {
          name: string;
          framework?: 'nextjs';
          app_root?: string;
          variable_scope?: 'all' | 'scoped';
          variables?: string[];
          archive: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Frontend'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Frontend'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getFrontend: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Frontend'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  redeployFrontend: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Frontend'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listFrontendDeployments: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedFrontendDeployments'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createFrontendDeployment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateFrontendDeploymentRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Frontend'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createVariable: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateVariableRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Variable'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDatabaseBackups: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBackupList'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createDatabaseBackup: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateDatabaseBackupRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBackup'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getDatabaseBackup: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
        backupName: components['parameters']['BackupName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBackup'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createDatabaseRestore: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateDatabaseRestoreRequest'];
      };
    };
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseRestore'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateVariable: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        name: components['parameters']['VariableName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateVariableRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Variable'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteVariable: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        name: components['parameters']['VariableName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authResetPassword: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Proxy-Authorization'?: components['parameters']['AuthProxyAuthorization'];
        'X-Volcano-Client-IP'?: components['parameters']['AuthProxyClientIP'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          token: string;
          new_password: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            message?: string;
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authUpdateUser: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': {
          password?: string;
          user_metadata?: {
            [key: string]: unknown;
          };
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            user?: components['schemas']['AuthUser'];
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listEmailTemplates: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data?: components['schemas']['EmailTemplate'][];
          };
        };
      };
    };
  };
  createEmailTemplate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateEmailTemplateRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EmailTemplate'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getEmailTemplate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        type: 'welcome' | 'confirmation' | 'password_reset' | 'password_changed';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EmailTemplate'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  updateEmailTemplate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        type: 'welcome' | 'confirmation' | 'password_reset' | 'password_changed';
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateEmailTemplateRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EmailTemplate'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getAuthConfig: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthConfig'];
        };
      };
    };
  };
  updateAuthConfig: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateAuthConfigRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthConfig'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authOAuthCallback: {
    parameters: {
      query: {
        code: string;
        state: string;
        error?: string;
      };
      header?: never;
      path: {
        provider: 'google' | 'github' | 'microsoft' | 'apple';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthTokenResponse'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthTokenResponse'];
        };
      };
      303: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  authListOAuthProviders: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            providers?: {
              provider?: string;
              linked_at?: string;
              updated_at?: string;
            }[];
          };
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createAnonKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          name: string;
          permissions?: (
            | 'auth.signup'
            | 'auth.signin'
            | 'auth.refresh'
            | 'auth.logout'
            | 'auth.password_reset'
            | 'auth.confirm_email'
            | 'auth.resend_confirmation'
            | 'storage.upload'
            | 'storage.download'
            | 'storage.list'
            | 'storage.delete'
            | 'realtime.connect'
            | 'realtime.subscribe'
            | 'realtime.publish'
            | 'functions.invoke'
          )[];
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AnonKey'];
        };
      };
    };
  };
  regenerateAnonKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        keyId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AnonKey'];
        };
      };
    };
  };
  setDefaultAnonKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        keyId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AnonKey'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createServiceKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          name: string;
          permissions?: string[];
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ServiceKey'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getServiceKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        keyId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ServiceKey'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  regenerateServiceKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        keyId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ServiceKey'];
        };
      };
    };
  };
  listCapabilities: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CapabilityList'];
        };
      };
    };
  };
}

interface HistoricalPaths {
  '/projects/{id}/sandbox-sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listSandboxSessions'];
    put?: never;
    post: operations['createSandboxSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/sandbox-executions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['executeSandbox'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sandbox-sessions/{sessionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getSandboxSession'];
    put?: never;
    post?: never;
    delete: operations['terminateSandboxSession'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sandbox-sessions/{sessionId}/suspend': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['suspendSandboxSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sandbox-sessions/{sessionId}/resume': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['resumeSandboxSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sandbox-sessions/{sessionId}/exec': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['executeSandboxSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/user/git/connections/{connectionId}/installations/{installationId}/repositories': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listGitInstallationRepositories'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/github/callback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['gitConnectCallback'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listProjects'];
    put?: never;
    post: operations['createProject'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProject'];
    put?: never;
    post?: never;
    delete: operations['deleteProject'];
    options?: never;
    head?: never;
    patch: operations['updateProject'];
    trace?: never;
  };
  '/projects/{id}/logo': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectLogo'];
    put?: never;
    post: operations['uploadProjectLogo'];
    delete: operations['deleteProjectLogo'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/shared-variables': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations['replaceSharedVariables'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/config': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectConfig'];
    put: operations['applyProjectConfig'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/source-export': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectSourceExport'];
    put?: never;
    post: operations['exportProjectSource'];
    delete: operations['cancelProjectSourceExport'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/git-connection/production-branch': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations['setProjectGitProductionBranch'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/git-connection/root-directory': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations['setProjectGitRootDirectory'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/git-connection': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectGitConnection'];
    put: operations['connectProjectGit'];
    post?: never;
    delete: operations['disconnectProjectGit'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/git-deploy-settings': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectGitDeploySettings'];
    put: operations['updateProjectGitDeploySettings'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/deployments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDeployments'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/deployments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listProjectDeployments'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/functions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listFunctions'];
    put?: never;
    post: operations['createFunction'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/functions/{functionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getFunction'];
    put?: never;
    post?: never;
    delete: operations['deleteFunction'];
    options?: never;
    head?: never;
    patch: operations['updateFunction'];
    trace?: never;
  };
  '/projects/{id}/functions/batch': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createFunctionsBatch'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/functions/{functionId}/deployments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listFunctionDeployments'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-functions/{functionId}/deployments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDurableFunctionDeployments'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/issues': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listIssues'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/issues/{issueId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getIssue'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations['updateIssue'];
    trace?: never;
  };
  '/projects/{id}/autofix': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAutofixSettings'];
    put: operations['updateAutofixSettings'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/issues/{issueId}/autofix-runs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['startAutofixRun'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/autofix-runs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAutofixRuns'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/autofix-runs/{runId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAutofixRun'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listFrontends'];
    put?: never;
    post: operations['createFrontend'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getFrontend'];
    put?: never;
    post?: never;
    delete: operations['deleteFrontend'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}/redeploy': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['redeployFrontend'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}/deployments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listFrontendDeployments'];
    put?: never;
    post: operations['createFrontendDeployment'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/variables': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listVariables'];
    put?: never;
    post: operations['createVariable'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/backups': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDatabaseBackups'];
    put?: never;
    post: operations['createDatabaseBackup'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/backups/{backupName}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDatabaseBackup'];
    put?: never;
    post?: never;
    delete: operations['deleteDatabaseBackup'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/restores': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDatabaseRestores'];
    put?: never;
    post: operations['createDatabaseRestore'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/variables/{name}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getVariable'];
    put: operations['updateVariable'];
    post?: never;
    delete: operations['deleteVariable'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/reset-password': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authResetPassword'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/user': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['authGetUser'];
    put: operations['authUpdateUser'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/email-templates': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listEmailTemplates'];
    put?: never;
    post: operations['createEmailTemplate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/email-templates/{type}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getEmailTemplate'];
    put: operations['updateEmailTemplate'];
    post?: never;
    delete: operations['deleteEmailTemplate'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/config': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAuthConfig'];
    put: operations['updateAuthConfig'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/oauth/{provider}/callback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['authOAuthCallback'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/oauth/providers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['authListOAuthProviders'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/anon-keys': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAnonKeys'];
    put?: never;
    post: operations['createAnonKey'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/anon-keys/{keyId}/regenerate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['regenerateAnonKey'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/anon-keys/{keyId}/set-default': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['setDefaultAnonKey'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/service-keys': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listServiceKeys'];
    put?: never;
    post: operations['createServiceKey'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/service-keys/{keyId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getServiceKey'];
    put?: never;
    post?: never;
    delete: operations['deleteServiceKey'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/service-keys/{keyId}/regenerate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['regenerateServiceKey'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/capabilities': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listCapabilities'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}

type components = Omit<CurrentComponents, 'schemas' | 'parameters'> & {
  schemas: Omit<CurrentComponents['schemas'], keyof HistoricalSchemas> & HistoricalSchemas;
  parameters: Omit<CurrentComponents['parameters'], keyof HistoricalParameters> & HistoricalParameters;
};
type operations = Omit<CurrentOperations, keyof HistoricalOperations> & HistoricalOperations;
type paths = Omit<CurrentPaths, keyof HistoricalPaths> & HistoricalPaths;

export type { components as OpenAPIComponents, operations as OpenAPIOperations, paths as OpenAPIPaths };
