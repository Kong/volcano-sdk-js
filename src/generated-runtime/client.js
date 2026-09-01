import { volcanoFetch } from './volcano-fetch';
export const getStartImportConnectUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/user/imports/connect?${stringifiedParams}` : `/user/imports/connect`;
};
/**
 * Starts a first-party dashboard user's provider connection flow. The
 * response sets a short-lived HttpOnly browser-binding cookie for the
 * public provider callback.
 * @summary Start a project import provider connection
 */
export const startImportConnect = async (params, options) => {
    return volcanoFetch(getStartImportConnectUrl(params), {
        ...options,
        method: 'POST'
    });
};
export const getCompleteImportConnectUrl = (params, provider = 'vercel') => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/imports/${provider}/callback?${stringifiedParams}` : `/imports/${provider}/callback`;
};
/**
 * Public provider callback protected by signed state and the browser-binding
 * cookie created by startImportConnect.
 * @summary Complete a project import provider connection
 */
export const completeImportConnect = async (params, provider = 'vercel', options) => {
    return volcanoFetch(getCompleteImportConnectUrl(params, provider), {
        ...options,
        method: 'GET'
    });
};
export const getListImportConnectionsUrl = () => {
    return `/user/imports/connections`;
};
/**
 * @summary List project import provider connections
 */
export const listImportConnections = async (options) => {
    return volcanoFetch(getListImportConnectionsUrl(), {
        ...options,
        method: 'GET'
    });
};
export const getDeleteImportConnectionUrl = (connectionId) => {
    return `/user/imports/connections/${connectionId}`;
};
/**
 * @summary Delete a project import provider connection
 */
export const deleteImportConnection = async (connectionId, options) => {
    return volcanoFetch(getDeleteImportConnectionUrl(connectionId), {
        ...options,
        method: 'DELETE'
    });
};
export const getListImportSourcesUrl = (params, provider = 'vercel') => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/imports/${provider}/sources?${stringifiedParams}` : `/imports/${provider}/sources`;
};
/**
 * Lists provider projects without changing provider or Volcano resources.
 * @summary List project sources available from a provider connection
 */
export const listImportSources = async (params, provider = 'vercel', options) => {
    return volcanoFetch(getListImportSourcesUrl(params, provider), {
        ...options,
        method: 'GET'
    });
};
export const getPreflightProjectImportUrl = (provider = 'vercel') => {
    return `/imports/${provider}/preflight`;
};
/**
 * Produces a deterministic read-only readiness report for a proposed new Volcano project.
 * @summary Check whether a provider project is ready to import
 */
export const preflightProjectImport = async (projectImportPreflightRequest, provider = 'vercel', options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getPreflightProjectImportUrl(provider), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(projectImportPreflightRequest)
    });
};
export const getStartProjectImportUrl = (provider = 'vercel') => {
    return `/imports/${provider}/runs`;
};
/**
 * Creates a Volcano project from an importable production preflight report. Retrying the same request with the same Idempotency-Key returns the existing run.
 * @summary Start a Vercel project import
 */
export const startProjectImport = async (projectImportStartRequest, provider = 'vercel', options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getStartProjectImportUrl(provider), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(projectImportStartRequest)
    });
};
export const getGetProjectImportRunUrl = (runId, provider = 'vercel') => {
    return `/imports/${provider}/runs/${runId}`;
};
/**
 * @summary Get a project import run
 */
export const getProjectImportRun = async (runId, provider = 'vercel', options) => {
    return volcanoFetch(getGetProjectImportRunUrl(runId, provider), {
        ...options,
        method: 'GET'
    });
};
export const getStartGitConnectUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/user/git/connect?${stringifiedParams}` : `/user/git/connect`;
};
/**
 * Starts a first-party dashboard user's git provider connection flow and
 * returns the provider authorization URL. The response also sets a
 * short-lived HttpOnly callback binding cookie tied to the authenticated
 * user through the signed provider state.
 * @summary Start a git provider connection
 */
export const startGitConnect = async (params, options) => {
    return volcanoFetch(getStartGitConnectUrl(params), {
        ...options,
        method: 'POST'
    });
};
export const getListGitConnectionsUrl = () => {
    return `/user/git/connections`;
};
/**
 * @summary List git provider connections
 */
export const listGitConnections = async (options) => {
    return volcanoFetch(getListGitConnectionsUrl(), {
        ...options,
        method: 'GET'
    });
};
export const getDeleteGitConnectionUrl = (connectionId) => {
    return `/user/git/connections/${connectionId}`;
};
/**
 * @summary Delete a git provider connection
 */
export const deleteGitConnection = async (connectionId, options) => {
    return volcanoFetch(getDeleteGitConnectionUrl(connectionId), {
        ...options,
        method: 'DELETE'
    });
};
export const getListGitInstallationsUrl = (connectionId) => {
    return `/user/git/connections/${connectionId}/installations`;
};
/**
 * Live proxy to GitHub: lists the platform GitHub App installations the
 * connection's stored user token can access. Nothing is persisted by
 * this call.
 * @summary List GitHub App installations accessible to a connection
 */
export const listGitInstallations = async (connectionId, options) => {
    return volcanoFetch(getListGitInstallationsUrl(connectionId), {
        ...options,
        method: 'GET'
    });
};
export const getListGitInstallationRepositoriesUrl = (connectionId, installationId) => {
    return `/user/git/connections/${connectionId}/installations/${installationId}/repositories`;
};
/**
 * Live proxy to GitHub: lists the repos the connection's stored user
 * token can access through installationId. Nothing is persisted by this
 * call.
 * @summary List repos accessible to a connection through an installation
 */
export const listGitInstallationRepositories = async (connectionId, installationId, options) => {
    return volcanoFetch(getListGitInstallationRepositoriesUrl(connectionId, installationId), {
        ...options,
        method: 'GET'
    });
};
export const getGitConnectCallbackUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/github/callback?${stringifiedParams}` : `/github/callback`;
};
/**
 * Public GitHub App callback. The signed state and callback binding cookie
 * bind the provider authorization to the browser that started the flow.
 * @summary Complete a GitHub App connection callback
 */
export const gitConnectCallback = async (params, options) => {
    return volcanoFetch(getGitConnectCallbackUrl(params), {
        ...options,
        method: 'GET'
    });
};
export const getListProjectsUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects?${stringifiedParams}` : `/projects`;
};
/**
 * Returns projects that are not deleting or deleted, newest first.
 * Supports two mutually exclusive pagination modes. Offset mode uses
 * `page` and `limit`. Cursor mode uses `cursor` or `ending_before` with
 * `limit`, returns `next_cursor`/`prev_cursor`, and supports a bounded
 * `offset` past the cursor anchor. Supplying `limit` without `page`
 * selects cursor mode. `search` applies a case-insensitive project-name
 * filter in either mode. Sending `page` with `cursor` or `ending_before`,
 * or sending both cursor directions, returns 400.
 * @summary List all projects for authenticated user
 */
export const listProjects = async (params, options) => {
    return volcanoFetch(getListProjectsUrl(params), {
        ...options,
        method: 'GET'
    });
};
export const getCreateProjectUrl = () => {
    return `/projects`;
};
/**
 * Creates a project for the authenticated user.
 * Each user can create up to 1,000 projects. Requests over this cap return 403.
 * @summary Create a new project
 */
export const createProject = async (createProjectRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateProjectUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createProjectRequest)
    });
};
export const getGetProjectUrl = (id) => {
    return `/projects/${id}`;
};
/**
 * @summary Get project by ID
 */
export const getProject = async (id, options) => {
    return volcanoFetch(getGetProjectUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getUpdateProjectUrl = (id) => {
    return `/projects/${id}`;
};
/**
 * @summary Update project metadata and region policy
 */
export const updateProject = async (id, updateProjectRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateProjectUrl(id), {
        ...options,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateProjectRequest)
    });
};
export const getDeleteProjectUrl = (id) => {
    return `/projects/${id}`;
};
/**
 * Starts asynchronous project deletion. The project remains available from
 * `GET /projects/{id}` with `status: deleting` until cleanup finishes, but is
 * removed from project lists as soon as deletion starts. After cleanup it
 * returns 404.
 * @summary Delete a project
 */
export const deleteProject = async (id, options) => {
    return volcanoFetch(getDeleteProjectUrl(id), {
        ...options,
        method: 'DELETE'
    });
};
export const getGetProjectHealthUrl = (id) => {
    return `/projects/${id}/health`;
};
/**
 * Returns a fast control-plane health snapshot for the project and its
 * deployed resources. The endpoint does not run live provider probes.
 * A successful request returns 200 even when the project status is
 * `unhealthy`; transport and authorization failures use HTTP errors.
 * @summary Get project health
 */
export const getProjectHealth = async (id, options) => {
    return volcanoFetch(getGetProjectHealthUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getQueryProjectMetricsUrl = (id) => {
    return `/projects/${id}/metrics/query`;
};
/**
 * Evaluates a batch of named, curated runtime metric queries over one
 * trailing time range. Query IDs correlate each request with its result;
 * raw backend query languages are intentionally not exposed.
 * @summary Query project runtime metrics
 */
export const queryProjectMetrics = async (id, projectMetricsQueryRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getQueryProjectMetricsUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(projectMetricsQueryRequest)
    });
};
export const getGetProjectLogoUrl = (id) => {
    return `/projects/${id}/logo`;
};
/**
 * Returns the raw logo image stored in the project's storage folder. This
 * endpoint is unauthenticated so the asset can be rendered directly in an
 * `<img>` tag; project IDs are unguessable UUIDs and logos are
 * non-sensitive branding. The `Project.logo_url` field exposes a versioned
 * path to this endpoint.
 * @summary Get the project logo image
 */
export const getProjectLogo = async (id, options) => {
    return volcanoFetch(getGetProjectLogoUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getUploadProjectLogoUrl = (id) => {
    return `/projects/${id}/logo`;
};
/**
 * Uploads an image as the project's logo, storing it in the project's
 * storage folder. Accepts PNG, JPEG, GIF, WebP, or SVG up to 2 MB. Replaces any
 * existing logo. Returns the updated project, whose `logo_url` reflects
 * the new logo.
 * @summary Upload or replace the project logo
 */
export const uploadProjectLogo = async (id, uploadProjectLogoBody, options) => {
    const formData = new FormData();
    formData.append(`logo`, uploadProjectLogoBody.logo);
    return volcanoFetch(getUploadProjectLogoUrl(id), {
        ...options,
        method: 'POST',
        body: formData
    });
};
export const getDeleteProjectLogoUrl = (id) => {
    return `/projects/${id}/logo`;
};
/**
 * Deletes the project logo from the project's storage folder and clears its
 * record. Returns the updated project with no `logo_url`.
 * @summary Remove the project logo
 */
export const deleteProjectLogo = async (id, options) => {
    return volcanoFetch(getDeleteProjectLogoUrl(id), {
        ...options,
        method: 'DELETE'
    });
};
export const getGetProjectUsageUrl = (id) => {
    return `/projects/${id}/usage`;
};
/**
 * Returns project usage totals for the current usage month plus
 * recent hourly and daily time series for each tracked metric.
 * @summary Get usage metrics for a project
 */
export const getProjectUsage = async (id, options) => {
    return volcanoFetch(getGetProjectUsageUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getGetProjectConfigUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/config?${stringifiedParams}` : `/projects/${id}/config`;
};
/**
 * Exports the project's current user-facing configuration as a
 * declarative manifest. Returns JSON by default. Request the canonical
 * volcano-config.yaml rendering with `Accept: application/yaml` or
 * `?format=yaml`; the YAML is returned verbatim as the raw response body
 * (`Content-Type: application/yaml`) and is meant to be saved as-is.
 * Write-only secrets (SMTP password, OAuth client secrets, TLS material)
 * are omitted from the export; the YAML rendering adds a header comment
 * describing how to set them via CLI environment interpolation.
 * @summary Export project configuration
 */
export const getProjectConfig = async (id, params, options) => {
    return volcanoFetch(getGetProjectConfigUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
export const getApplyProjectConfigUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/config?${stringifiedParams}` : `/projects/${id}/config`;
};
/**
 * Validates and applies a declarative configuration manifest to the
 * project, reconciling each declared section and returning a per-resource
 * report. Omitted sections are untouched. Declared collection keys
 * (`variables`, `buckets[].policies`, `auth.providers.oauth`,
 * `auth.email.templates`, `functions[].schedulers`) are fully synced:
 * resources absent from the manifest are deleted. Functions, frontends,
 * databases, and buckets are never created or deleted; manifest entries
 * for resources that do not exist are skipped and reported in `skipped`,
 * and existing resources missing from a declared section are reported in
 * `missing`. Validation failures (including plan-gate violations) return
 * 422 and nothing is applied. Set `dry_run=true` to get the projected
 * report without applying changes. Applies are serialized per project;
 * a concurrent apply returns 409.
 * @summary Apply project configuration
 */
export const applyProjectConfig = async (id, projectConfig, params, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getApplyProjectConfigUrl(id, params), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(projectConfig)
    });
};
export const getGetProjectSourceExportUrl = (id) => {
    return `/projects/${id}/source-export`;
};
/**
 * Volcano stores the source of the functions and frontend it runs for a
 * project. This reports whether that source has been written to the
 * connected repository, and whether the repository has taken over as the
 * project's source of truth.
 *
 * `mode` is `platform`, `git_exporting`, `git_pending`, or `git`. Export
 * enters `git_exporting` before reading stored source. GitHub's signed
 * push event confirms that the initial commit reached the production
 * branch. That push or a newer production push changes the mode to
 * `git_pending` when it starts a deployment. `exported_at` records that
 * transition.
 *
 * A successful Git run completes the transition when it matches the
 * recorded repository, production branch, and root directory and actually
 * dispatches every recorded resource. Ordinary production-branch pushes
 * deploy without changing a platform-managed project's source ownership.
 * @summary Report the project's source-of-truth state
 */
export const getProjectSourceExport = async (id, options) => {
    return volcanoFetch(getGetProjectSourceExportUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getExportProjectSourceUrl = (id) => {
    return `/projects/${id}/source-export`;
};
/**
 * Creates the first commit in the connected repository and pushes it
 * directly to the configured production branch. The push enters the
 * ordinary Git auto-deploy flow. Direct source writes remain frozen until
 * that deployment succeeds and the repository becomes the source of truth.
 *
 * The caller confirms the production branch shown before export. Starting
 * export pins that branch: later GitHub default-branch changes do not
 * repoint the project. If the configured branch changed after the caller
 * read it, the request fails without exporting so the caller can show and
 * confirm the new value.
 *
 * The response lists what the export could not carry: resources with no
 * successful deployment to take source from (`skipped`), and things no
 * export can hand back (`omitted`) — migrations, which Volcano stores no
 * copy of, and credential-shaped files, which are left for their owner to
 * add.
 *
 * Requires a connected repository with no commits or branches, and runs
 * once. Volcano never creates the repository. If GitHub did not confirm
 * the push, retrying creates the same commit and adopts it when it already
 * reached the repository.
 * @summary Initialize an empty repository with a project's stored source
 */
export const exportProjectSource = async (id, exportProjectSourceRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getExportProjectSourceUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(exportProjectSourceRequest)
    });
};
export const getCancelProjectSourceExportUrl = (id) => {
    return `/projects/${id}/source-export`;
};
/**
 * Restores platform source writes while the project is in
 * `git_exporting` or `git_pending`. If Volcano reserved or deployed the
 * root commit, export remains consumed and cannot be run again. The
 * connected repository and any commit already pushed to it are unchanged.
 * @summary Cancel an incomplete source export
 */
export const cancelProjectSourceExport = async (id, options) => {
    return volcanoFetch(getCancelProjectSourceExportUrl(id), {
        ...options,
        method: 'DELETE'
    });
};
export const getSetProjectGitProductionBranchUrl = (id) => {
    return `/projects/${id}/git-connection/production-branch`;
};
/**
 * Changes only the production branch, leaving the repository binding
 * alone. PUT /projects/{id}/git-connection can also set it, but that is a
 * full rebind: it needs connection_id, installation_id and a repository
 * selector resent, and re-resolves the repository against GitHub for a
 * field that does not depend on it.
 *
 * The branch does not have to exist. It is validated as a Git branch name
 * and nothing more, so a project can be pointed at a branch that is about
 * to be pushed — the case a repository created empty depends on.
 *
 * Setting the branch here marks it as the project's own choice, so a later
 * default-branch rename on GitHub no longer moves it. Projects that never
 * set one keep following the repository's default branch.
 * @summary Set the branch a project deploys from
 */
export const setProjectGitProductionBranch = async (id, setProjectGitProductionBranchRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getSetProjectGitProductionBranchUrl(id), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(setProjectGitProductionBranchRequest)
    });
};
export const getGetProjectGitConnectionUrl = (id) => {
    return `/projects/${id}/git-connection`;
};
/**
 * @summary Get a project's repo connection
 */
export const getProjectGitConnection = async (id, options) => {
    return volcanoFetch(getGetProjectGitConnectionUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getConnectProjectGitUrl = (id) => {
    return `/projects/${id}/git-connection`;
};
/**
 * Full replace, following Vercel's model: many projects may point at the
 * same repo, so this only binds the project — it never creates or
 * deletes git-provider state. Used for both the initial connect and
 * later edits (repo change, root directory, production branch).
 * Resolves the repository_id or repo_full_name selector against the repos
 * accessible through installation_id via connection_id's stored GitHub
 * user token, then persists repository metadata only from that validated
 * GitHub response.
 * @summary Connect or update a project's repo connection
 */
export const connectProjectGit = async (id, connectProjectGitRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getConnectProjectGitUrl(id), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(connectProjectGitRequest)
    });
};
export const getDisconnectProjectGitUrl = (id) => {
    return `/projects/${id}/git-connection`;
};
/**
 * @summary Disconnect a project's repo connection
 */
export const disconnectProjectGit = async (id, options) => {
    return volcanoFetch(getDisconnectProjectGitUrl(id), {
        ...options,
        method: 'DELETE'
    });
};
export const getGetProjectGitDeploySettingsUrl = (id) => {
    return `/projects/${id}/git-deploy-settings`;
};
/**
 * @summary Get a project's Git auto-deploy settings
 */
export const getProjectGitDeploySettings = async (id, options) => {
    return volcanoFetch(getGetProjectGitDeploySettingsUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getUpdateProjectGitDeploySettingsUrl = (id) => {
    return `/projects/${id}/git-deploy-settings`;
};
/**
 * Full replace of the project's Git auto-deploy settings: what a push to
 * the connected repo's production branch deploys.
 *
 * Connecting a repository sets auto_deploy_enabled and deploy_functions
 * to true for a project that has never called this endpoint, so a push
 * deploys without any further setup. Once these settings have been saved
 * here they are the project's own: connecting, rebinding, disconnecting
 * and reconnecting all leave them untouched, including when they were
 * saved before any repository was connected. Frontend settings are off
 * until set here; the frontend need not exist when they are saved, since
 * frontend_name is resolved at deploy time.
 * @summary Update a project's Git auto-deploy settings
 */
export const updateProjectGitDeploySettings = async (id, updateProjectGitDeploySettingsRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateProjectGitDeploySettingsUrl(id), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateProjectGitDeploySettingsRequest)
    });
};
export const getGetProjectDatabaseQueriesUrl = (id, databaseName, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/databases/${databaseName}/queries?${stringifiedParams}` : `/projects/${id}/databases/${databaseName}/queries`;
};
/**
 * Returns the database's current top queries from pg_stat_statements
 * ranked by total execution time.
 *
 * **PRO plan required.** This endpoint is only available to projects owned
 * by users on the PRO billing plan.
 * @summary Get database queries
 */
export const getProjectDatabaseQueries = async (id, databaseName, params, options) => {
    return volcanoFetch(getGetProjectDatabaseQueriesUrl(id, databaseName, params), {
        ...options,
        method: 'GET'
    });
};
export const getListDeploymentsUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/deployments?${stringifiedParams}` : `/deployments`;
};
/**
 * Lists Function and Frontend deployment attempts across every project the
 * user owns, newest first. Pass `project_id` to narrow the feed to a single
 * project.
 *
 * Scope is project **ownership** (`projects.user_id`). `owner_id` names
 * whose deployments to return, not who started them — the actor is
 * `initiated_by_user_id`, which this endpoint does not filter on.
 *
 * With a user token the scope is always the authenticated user: `owner_id`
 * may be omitted, or set to that same user, but naming anyone else is
 * refused with 403. Service callers on the management API must pass it,
 * since they have no authenticated user.
 *
 * The owner is not checked for existence: an id with no projects returns an
 * empty page rather than `404`. Unlike `/users/{id}/usage`, this endpoint is
 * polled to detect an event, so a caller needs `404` to keep meaning "this
 * route is not served here" — which is how a consumer notices it is running
 * against an older release. A mistyped owner therefore reads as "nothing
 * deployed"; callers that need to tell those apart should verify the user
 * through `GET /users/{id}` first.
 *
 * Ordering is selectable. The default is the feed order — most recent
 * attempt first. `completed_at.asc` orders by completion, oldest first, and
 * considers only attempts that finished; combined with `limit=1` and a
 * `status` filter it answers "when did this user first succeed" in one
 * bounded query.
 *
 * Both pagination modes are supported, selected exactly as
 * `/projects/{id}/deployments` selects them: `cursor`/`ending_before` (or a
 * `limit` with no `page`) uses keyset pagination; otherwise `page`/`limit`
 * offset pagination. `page` with a cursor, and `cursor` with
 * `ending_before`, are rejected.
 *
 * A cursor is bound to every filter *and* to `order`, so changing any of
 * them mid-pagination rejects the cursor rather than silently skipping or
 * repeating rows. The keyset position is `(created_at, id)` for
 * `created_at.desc` and `(completed_at, id)` for `completed_at.asc`.
 * @summary List deployments across a user's projects
 */
export const listDeployments = async (params, options) => {
    return volcanoFetch(getListDeploymentsUrl(params), {
        ...options,
        method: 'GET'
    });
};
export const getListProjectDeploymentsUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/deployments?${stringifiedParams}` : `/projects/${id}/deployments`;
};
/**
 * Lists Function and Frontend deployment attempts across the project,
 * ordered most-recent first. Each item includes a normalized resource
 * reference so clients can render both resource types without extra
 * fetches.
 * @summary List deployments in a project
 */
export const listProjectDeployments = async (id, params, options) => {
    return volcanoFetch(getListProjectDeploymentsUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
export const getSummarizeProjectDeploymentsUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/deployments/summary?${stringifiedParams}` : `/projects/${id}/deployments/summary`;
};
/**
 * Summarizes deployment attempts for one comparable resource pipeline.
 * Success rate uses conclusive outcomes only: active and deleted attempts
 * are successful; failed and degraded attempts are failures; in-progress
 * and superseded attempts are excluded. Median build duration includes
 * completed, non-superseded attempts with recorded build work,
 * including failed builds.
 * @summary Summarize deployments in a project
 */
export const summarizeProjectDeployments = async (id, params, options) => {
    return volcanoFetch(getSummarizeProjectDeploymentsUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
export const getListProjectCustomDomainsUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/domains?${stringifiedParams}` : `/projects/${id}/domains`;
};
/**
 * Project-scoped custom-domain list. Returns every active custom
 * domain across every frontend in the project (excludes soft-deleted
 * rows). Each item inlines the linked frontend's id and name so the
 * UI does not need a second fetch to render the "Linked to" column.
 * @summary List all custom domains in a project
 */
export const listProjectCustomDomains = async (id, params, options) => {
    return volcanoFetch(getListProjectCustomDomainsUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
export const getListFunctionsUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/functions?${stringifiedParams}` : `/projects/${id}/functions`;
};
/**
 * Supports two mutually exclusive pagination modes. Offset mode uses `page`
 * and `limit` and returns `next` (URL). Cursor mode uses `cursor` and
 * `limit`, supports `search` (case-insensitive name match), and returns
 * `next_cursor`/`prev_cursor`. Sending both `page` and `cursor` (or `page`
 * and `search`) returns 400.
 * @summary List all functions in a project
 */
export const listFunctions = async (id, params, options) => {
    return volcanoFetch(getListFunctionsUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
export const getCreateFunctionUrl = (id) => {
    return `/projects/${id}/functions`;
};
/**
 * Upload a serverless function source bundle. Direct API clients may send the function code
 * as a ZIP or tar.gz archive via multipart/form-data. The API stores a normalized tar.gz
 * source archive.
 * Cloud deploys should include source files and dependency manifests/lockfiles, not installed
 * dependency directories. Volcano installs Node.js, Python, and Ruby dependencies during the
 * function compile build.
 * Source archive size is enforced by the API with `SOURCE_ARCHIVE_SIZE_LIMIT_MB`; the CLI
 * does not apply its own source archive size limit. After the final container image is
 * built, the publish build enforces `LAMBDA_TARGET_CONTAINER_SIZE_LIMIT_MB` before pushing.
 * Uploaded source archives cannot contain symlink entries. Safe symlinks created during
 * the cloud build are materialized before publish.
 * Volcano builds and deploys the function asynchronously after upload. A deployment that starts
 * immediately returns a Function resource with `status: provisioning`, then transitions to
 * `active` or `failed`. If another deployment is running, the response preserves the resource's
 * current status and exposes the queued deployment through `pending_deployment_id`.
 * Existing function traffic continues to use the last known-good runtime during an update. A failed
 * update keeps that runtime available and records the attempted deployment as failed.
 * Only one deployment runs for a given function. A newer request supersedes any queued request
 * and starts after the running deployment. Different functions and projects deploy concurrently.
 * If a function with the same name already exists in the project, this operation updates that
 * function's runtime, handler, and source bundle and returns `200 OK`.
 * Each project can contain up to 10,000 functions. Creating a new function over this cap returns 403.
 * @summary Create or update function code
 */
export const createFunction = async (id, createFunctionBody, options) => {
    const formData = new FormData();
    formData.append(`name`, createFunctionBody.name);
    formData.append(`code`, createFunctionBody.code);
    formData.append(`runtime`, createFunctionBody.runtime);
    if (createFunctionBody.handler !== undefined) {
        formData.append(`handler`, createFunctionBody.handler);
    }
    if (createFunctionBody.is_public !== undefined) {
        formData.append(`is_public`, createFunctionBody.is_public.toString());
    }
    if (createFunctionBody.invocation_mode !== undefined) {
        formData.append(`invocation_mode`, createFunctionBody.invocation_mode);
    }
    if (createFunctionBody.http_auth_mode !== undefined) {
        formData.append(`http_auth_mode`, createFunctionBody.http_auth_mode);
    }
    if (createFunctionBody.openapi_spec !== undefined) {
        formData.append(`openapi_spec`, createFunctionBody.openapi_spec);
    }
    return volcanoFetch(getCreateFunctionUrl(id), {
        ...options,
        method: 'POST',
        body: formData
    });
};
export const getGetFunctionUrl = (id, functionId) => {
    return `/projects/${id}/functions/${functionId}`;
};
/**
 * @summary Get function by ID
 */
export const getFunction = async (id, functionId, options) => {
    return volcanoFetch(getGetFunctionUrl(id, functionId), {
        ...options,
        method: 'GET'
    });
};
export const getUpdateFunctionUrl = (id, functionId) => {
    return `/projects/${id}/functions/${functionId}`;
};
/**
 * @summary Update function settings
 */
export const updateFunction = async (id, functionId, updateFunctionRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateFunctionUrl(id, functionId), {
        ...options,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateFunctionRequest)
    });
};
export const getDeleteFunctionUrl = (id, functionId) => {
    return `/projects/${id}/functions/${functionId}`;
};
/**
 * Schedules asynchronous function deletion. If another deployment is running, the function
 * preserves its current status and exposes the queued deletion through `pending_deployment_id`.
 * Its status changes to `deleting` when cleanup starts. After cleanup, it returns 404 and no
 * longer appears in function lists.
 * @summary Delete a function
 */
export const deleteFunction = async (id, functionId, options) => {
    return volcanoFetch(getDeleteFunctionUrl(id, functionId), {
        ...options,
        method: 'DELETE'
    });
};
export const getInvokeFunctionUrl = (functionId) => {
    return `/functions/${functionId}/invoke`;
};
/**
 * Invoke a serverless function.
 *
 * **With Service Key** (admin/background operations):
 * - Use for background jobs, webhooks, cron, admin operations
 * - Function receives payload only (no user context)
 * - Database queries bypass RLS (admin access)
 *
 * **With Auth User Token** (user-facing):
 * - Use for user-initiated actions
 * - Function receives payload + `__volcano_auth` context:
 *   ```javascript
 *   {
 *     user_id: "uuid",
 *     email: "user@example.com",
 *     project_id: "uuid",
 *     role: "authenticated" or "anonymous"
 *   }
 *   ```
 * - Database queries enforce RLS (user-scoped data)
 *
 * **With Anon Key** (public function only):
 * - Requires anon key permission: `functions.invoke`
 * - Function must have `is_public: true`
 * - Function receives payload only (no `__volcano_auth`)
 *
 * **Transport and CORS:**
 * - This operation is the authenticated direct RPC endpoint and always uses the
 *   POST `{payload: ...}` contract, including for functions whose DNS ingress is
 *   configured in HTTP mode.
 * - The geo-routed DNS ingress is `https://{functionId}.functions.<domain>/`.
 * - RPC-mode DNS ingress accepts POST at `/`. HTTP-mode DNS ingress accepts GET,
 *   HEAD, POST, PUT, PATCH, and DELETE at `/` and nested paths.
 * - Direct and RPC-mode CORS preflight advertises `POST, OPTIONS`. HTTP-mode DNS
 *   preflight advertises `GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS`.
 * - `http_auth_mode: none` applies only to public HTTP-mode DNS ingress; this
 *   direct operation always requires a Volcano credential.
 * @summary Invoke a function
 */
export const invokeFunction = async (functionId, functionInvocationRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getInvokeFunctionUrl(functionId), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(functionInvocationRequest)
    });
};
export const getResolveFunctionForInvocationUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/functions/resolve?${stringifiedParams}` : `/functions/resolve`;
};
/**
 * Resolves a DNS-safe function name to its function ID within the caller's project.
 *
 * SDKs use this endpoint internally to invoke by function name while routing by function ID.
 *
 * **With Service Key**:
 * - Allowed
 *
 * **With Auth User Token**:
 * - Allowed
 *
 * **With Anon Key**:
 * - Requires anon key permission: `functions.invoke`
 * - Function must have `is_public: true`
 * @summary Resolve function name for invocation
 */
export const resolveFunctionForInvocation = async (params, options) => {
    return volcanoFetch(getResolveFunctionForInvocationUrl(params), {
        ...options,
        method: 'GET'
    });
};
export const getGetProjectLogActivityUrl = (id) => {
    return `/projects/${id}/logs/activity`;
};
/**
 * Retrieve bucketed log counts for one resource type in the project. Set
 * `resource.type` to `function`, `frontend`, or `database`. Add
 * `resource.ids` to filter to one or more resources, and add
 * `resource.deployments.ids` to count deployment logs instead of runtime
 * logs for functions and frontends. Deployment logs are not supported for
 * databases. Database logs are a PRO-plan feature; `resource.type=database`
 * from a FREE-plan project owner returns 403. The activity window is limited
 * to the plan's retention window (FREE: 1 day, PRO: 30 days); older start
 * times are clamped to that window.
 * @summary Get project log activity
 */
export const getProjectLogActivity = async (id, logActivityRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getGetProjectLogActivityUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(logActivityRequest)
    });
};
export const getSearchProjectLogsUrl = (id) => {
    return `/projects/${id}/logs/search`;
};
/**
 * Search or filter logs for one resource type in the project. Set
 * `resource.type` to `function`, `frontend`, or `database`. Add
 * `resource.ids` to filter to one or more resources, and add
 * `resource.deployments.ids` to read deployment logs instead of runtime
 * logs for functions and frontends. Deployment logs are not supported for
 * databases. Database logs are a PRO-plan feature; requests for
 * `resource.type=database` from a FREE-plan project owner return 403.
 * Log history (runtime and deployment) is limited to the plan's retention
 * window (FREE: 1 day, PRO: 30 days); older time ranges are clamped to that
 * window.
 * @summary Search project logs
 */
export const searchProjectLogs = async (id, logSearchRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getSearchProjectLogsUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(logSearchRequest)
    });
};
export const getStreamProjectLogsUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/logs/stream?${stringifiedParams}` : `/projects/${id}/logs/stream`;
};
/**
 * Live-tail project logs as Server-Sent Events. The request body uses the
 * resource selector plus `q`, `start_time`, and `limit`,
 * including runtime logs and function/frontend deployment logs selected
 * with `resource.deployments`. Deployment logs are not supported for
 * databases. Database logs are a PRO-plan feature; `resource.type=database`
 * from a FREE-plan project owner returns 403. The `q` field uses the same
 * syntax as search and activity requests. Do not send `cursor` or
 * `end_time`; use `/logs/search` for range backfills.
 * Explicit historical `start_time` values are limited to the plan's
 * retention window (FREE: 1 day, PRO: 30 days). Resume with
 * `Last-Event-ID` or the `last_event_id` query parameter. The cursor is
 * bound to the request body: the resource selector and every filter must
 * match the original request when reconnecting, otherwise the request is
 * rejected with `400`.
 *
 * This is a live tail, not a gap-free backfill. On connect or reconnect the
 * server delivers at most `limit` of the most recent matching events from
 * the cursor position and then follows new events; events older than that
 * window are not replayed. Use `/logs/search` to backfill a time range.
 * @summary Stream project logs
 */
export const streamProjectLogs = async (id, logStreamRequest, params, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getStreamProjectLogsUrl(id, params), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(logStreamRequest)
    });
};
export const getCreateFunctionsBatchUrl = (id) => {
    return `/projects/${id}/functions/batch`;
};
/**
 * Upload multiple function source archives in one multipart request. Each archive should contain source files
 * plus dependency manifests/lockfiles, not installed dependency directories. ZIP and tar.gz uploads are
 * accepted and normalized to tar.gz before storage. The API enforces `SOURCE_ARCHIVE_SIZE_LIMIT_MB`
 * for each uploaded and normalized source archive. The server records a shared
 * deployment batch ID for the resulting function deployments. Each function deployment runs its own
 * compile/publish workflow concurrently, and each publish build enforces `LAMBDA_TARGET_CONTAINER_SIZE_LIMIT_MB`
 * for the final container image.
 * One batch request can include up to 100 functions. Submit multiple batch requests for larger projects.
 * If one function fails before its workflow starts, already-started function deployments are left
 * running and the failed function is reported in the `failed` array. Failed new functions are deleted;
 * failed updates are rolled back to their previous metadata/status where possible.
 * @summary Deploy multiple functions in one request
 */
export const createFunctionsBatch = async (id, createFunctionsBatchBody, options) => {
    const formData = new FormData();
    formData.append(`functions`, createFunctionsBatchBody.functions);
    if (createFunctionsBatchBody.code_0 !== undefined) {
        formData.append(`code_0`, createFunctionsBatchBody.code_0);
    }
    return volcanoFetch(getCreateFunctionsBatchUrl(id), {
        ...options,
        method: 'POST',
        body: formData
    });
};
;
export const getListProjectSchedulersUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/schedulers?${stringifiedParams}` : `/projects/${id}/schedulers`;
};
/**
 * Project-scoped counterpart to `/projects/{id}/functions/{functionId}/schedulers`.
 * Returns schedulers across all functions in the project, ordered by
 * creation time descending, with standard page/limit pagination so
 * clients don't have to fan out one request per function.
 * @summary List every function scheduler in a project
 */
export const listProjectSchedulers = async (id, params, options) => {
    return volcanoFetch(getListProjectSchedulersUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
;
export const getListFunctionSchedulersUrl = (id, functionId) => {
    return `/projects/${id}/functions/${functionId}/schedulers`;
};
/**
 * @summary List schedulers for a function
 */
export const listFunctionSchedulers = async (id, functionId, options) => {
    return volcanoFetch(getListFunctionSchedulersUrl(id, functionId), {
        ...options,
        method: 'GET'
    });
};
export const getCreateFunctionSchedulerUrl = (id, functionId) => {
    return `/projects/${id}/functions/${functionId}/schedulers`;
};
/**
 * Creates regional scheduled invocation jobs. Requested regions must be a subset of the function's deployed regions.
 * @summary Create a scheduler for a function
 */
export const createFunctionScheduler = async (id, functionId, createFunctionSchedulerRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateFunctionSchedulerUrl(id, functionId), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createFunctionSchedulerRequest)
    });
};
;
export const getGetFunctionSchedulerUrl = (id, functionId, schedulerId) => {
    return `/projects/${id}/functions/${functionId}/schedulers/${schedulerId}`;
};
/**
 * @summary Get a function scheduler
 */
export const getFunctionScheduler = async (id, functionId, schedulerId, options) => {
    return volcanoFetch(getGetFunctionSchedulerUrl(id, functionId, schedulerId), {
        ...options,
        method: 'GET'
    });
};
;
export const getUpdateFunctionSchedulerUrl = (id, functionId, schedulerId) => {
    return `/projects/${id}/functions/${functionId}/schedulers/${schedulerId}`;
};
/**
 * @summary Update a function scheduler
 */
export const updateFunctionScheduler = async (id, functionId, schedulerId, updateFunctionSchedulerRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateFunctionSchedulerUrl(id, functionId, schedulerId), {
        ...options,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateFunctionSchedulerRequest)
    });
};
;
export const getDeleteFunctionSchedulerUrl = (id, functionId, schedulerId) => {
    return `/projects/${id}/functions/${functionId}/schedulers/${schedulerId}`;
};
/**
 * @summary Delete a function scheduler
 */
export const deleteFunctionScheduler = async (id, functionId, schedulerId, options) => {
    return volcanoFetch(getDeleteFunctionSchedulerUrl(id, functionId, schedulerId), {
        ...options,
        method: 'DELETE'
    });
};
export const getListFunctionDeploymentsUrl = (id, functionId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/functions/${functionId}/deployments?${stringifiedParams}` : `/projects/${id}/functions/${functionId}/deployments`;
};
/**
 * @summary List function deployments
 */
export const listFunctionDeployments = async (id, functionId, params, options) => {
    return volcanoFetch(getListFunctionDeploymentsUrl(id, functionId, params), {
        ...options,
        method: 'GET'
    });
};
export const getListFrontendsUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/frontends?${stringifiedParams}` : `/projects/${id}/frontends`;
};
/**
 * Supports two mutually exclusive pagination modes. Offset mode uses `page`
 * and `limit` and returns `next` (URL). Cursor mode uses `cursor` and
 * `limit`, supports `search` (case-insensitive name match), and returns
 * `next_cursor`. Sending both `page` and `cursor` (or `page` and `search`)
 * returns 400.
 * @summary List all frontends in a project
 */
export const listFrontends = async (id, params, options) => {
    return volcanoFetch(getListFrontendsUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
export const getCreateFrontendUrl = (id) => {
    return `/projects/${id}/frontends`;
};
/**
 * Creates and deploys a frontend for the project.
 * If a frontend with the same name already exists in the project, this operation updates that
 * frontend using the uploaded archive and starts a new deployment. A deployment that starts
 * immediately returns `status: provisioning`, then transitions to `active`, `degraded`, or
 * `failed`. If another deployment is running, the response preserves the frontend's current status
 * and exposes the queued deployment through `pending_deployment_id`.
 * Existing frontend traffic continues to use an available runtime while the new deployment builds
 * and provisions. Each deployment publishes its own static assets before the runtimes switch to its
 * build, and the live build's assets keep serving until the new deployment is live, so a page loaded
 * mid-deployment resolves its assets whichever build served it. A failed redeploy puts the runtimes
 * back on the build they were running, leaves the frontend `active` on the previous deployment, and
 * records the attempted deployment as failed. `degraded` means the runtime remains available but
 * edge synchronization requires recovery; Volcano retries the edge step without rebuilding. Only one deployment may run for a
 * given frontend, while independent frontends and projects can deploy concurrently.
 * For monorepos, provide `app_root` as a relative path from the uploaded archive root
 * to the Next.js app that should be built. Omit it for single-app archives.
 * Supported frontend environments are Next.js 15.x and 16.x with Node.js
 * 22.x or 24.x. The Node.js runtime is inferred from
 * `package.json` `engines.node`; if omitted, Volcano uses Node.js 22.x.
 * The selected Node.js family must also satisfy the installed Next.js package's
 * `engines.node` constraint. Volcano tests Next 15.5.25 (`^18.18.0 || ^19.8.0 || >=20.0.0`) and Next 16.3.4 (`>=20.9.0`).
 * Source archive size is enforced by the API with `SOURCE_ARCHIVE_SIZE_LIMIT_MB`; the CLI
 * does not apply its own source archive size limit. After the final container images are
 * built, the publish build enforces `LAMBDA_TARGET_CONTAINER_SIZE_LIMIT_MB` before pushing.
 * This operation is limited by plan-based frontend deployment quotas (`FREE_FRONTEND_DEPLOYMENTS`, `PRO_FRONTEND_DEPLOYMENTS`).
 * Each project can contain up to 10,000 frontends regardless of plan.
 * @summary Create a new frontend deployment
 */
export const createFrontend = async (id, createFrontendBody, options) => {
    const formData = new FormData();
    formData.append(`name`, createFrontendBody.name);
    if (createFrontendBody.framework !== undefined) {
        formData.append(`framework`, createFrontendBody.framework);
    }
    if (createFrontendBody.app_root !== undefined) {
        formData.append(`app_root`, createFrontendBody.app_root);
    }
    formData.append(`archive`, createFrontendBody.archive);
    return volcanoFetch(getCreateFrontendUrl(id), {
        ...options,
        method: 'POST',
        body: formData
    });
};
export const getGetFrontendUrl = (id, frontendId) => {
    return `/projects/${id}/frontends/${frontendId}`;
};
/**
 * @summary Get frontend details
 */
export const getFrontend = async (id, frontendId, options) => {
    return volcanoFetch(getGetFrontendUrl(id, frontendId), {
        ...options,
        method: 'GET'
    });
};
export const getDeleteFrontendUrl = (id, frontendId) => {
    return `/projects/${id}/frontends/${frontendId}`;
};
/**
 * Schedules asynchronous frontend deletion. If another deployment is running, the frontend
 * preserves its current status and exposes the queued deletion through `pending_deployment_id`.
 * Its status changes to `deleting` when cleanup starts. After cleanup, it returns 404 and no
 * longer appears in frontend lists.
 * @summary Delete a frontend
 */
export const deleteFrontend = async (id, frontendId, options) => {
    return volcanoFetch(getDeleteFrontendUrl(id, frontendId), {
        ...options,
        method: 'DELETE'
    });
};
export const getRedeployFrontendUrl = (id, frontendId) => {
    return `/projects/${id}/frontends/${frontendId}/redeploy`;
};
/**
 * Starts a new frontend workflow using the latest stored artifact. A deployment that starts
 * immediately returns `status: provisioning`, then transitions to `active`, `degraded`, or
 * `failed`. An overlapping deployment preserves the frontend's current status, is exposed through
 * `pending_deployment_id`, and supersedes any older queued deployment. The previous runtime and its
 * published static assets remain available during provisioning, and a failed redeploy restores the
 * regional runtimes to that build and keeps it serving while the attempted deployment is recorded as
 * failed.
 * @summary Redeploy frontend using latest uploaded artifact
 */
export const redeployFrontend = async (id, frontendId, options) => {
    return volcanoFetch(getRedeployFrontendUrl(id, frontendId), {
        ...options,
        method: 'POST'
    });
};
export const getGetFrontendCustomDomainUrl = (id, frontendId) => {
    return `/projects/${id}/frontends/${frontendId}/domain`;
};
/**
 * @summary Get frontend custom domain status
 */
export const getFrontendCustomDomain = async (id, frontendId, options) => {
    return volcanoFetch(getGetFrontendCustomDomainUrl(id, frontendId), {
        ...options,
        method: 'GET'
    });
};
export const getCreateFrontendCustomDomainUrl = (id, frontendId) => {
    return `/projects/${id}/frontends/${frontendId}/domain`;
};
/**
 * Configures one custom domain for a frontend.
 * The default Volcano-generated frontend URL remains active.
 * Wildcard Volcano frontend TLS remains valid and isolated from custom-domain certificate changes.
 * @summary Configure frontend custom domain (PRO)
 */
export const createFrontendCustomDomain = async (id, frontendId, createFrontendCustomDomainRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateFrontendCustomDomainUrl(id, frontendId), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createFrontendCustomDomainRequest)
    });
};
export const getDeleteFrontendCustomDomainUrl = (id, frontendId) => {
    return `/projects/${id}/frontends/${frontendId}/domain`;
};
/**
 * @summary Delete frontend custom domain
 */
export const deleteFrontendCustomDomain = async (id, frontendId, options) => {
    return volcanoFetch(getDeleteFrontendCustomDomainUrl(id, frontendId), {
        ...options,
        method: 'DELETE'
    });
};
export const getListFrontendDeploymentsUrl = (id, frontendId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/frontends/${frontendId}/deployments?${stringifiedParams}` : `/projects/${id}/frontends/${frontendId}/deployments`;
};
/**
 * @summary List frontend deployments
 */
export const listFrontendDeployments = async (id, frontendId, params, options) => {
    return volcanoFetch(getListFrontendDeploymentsUrl(id, frontendId, params), {
        ...options,
        method: 'GET'
    });
};
export const getGetFrontendUsageHistoryUrl = (id, frontendId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/frontends/${frontendId}/usage?${stringifiedParams}` : `/projects/${id}/frontends/${frontendId}/usage`;
};
/**
 * Returns a zero-filled daily series of request counts and 5xx
 * error counts for one frontend, oldest first. Each entry is one
 * UTC day; missing days (no traffic recorded) come back as
 * `requests: 0, errors: 0` so the response always has exactly
 * `days` entries.
 *
 * Backs the Monitoring section on the Frontend detail page in
 * volcano-web. `days` defaults to 30 and is capped at 90 to keep
 * the (frontend_id, day) index scan bounded.
 * @summary Per-day request and error counts for a single frontend
 */
export const getFrontendUsageHistory = async (id, frontendId, params, options) => {
    return volcanoFetch(getGetFrontendUsageHistoryUrl(id, frontendId, params), {
        ...options,
        method: 'GET'
    });
};
export const getListVariablesUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/variables?${stringifiedParams}` : `/projects/${id}/variables`;
};
/**
 * Returns project-level environment variables used by deployed functions and frontends.
 * @summary List all variables for a project
 */
export const listVariables = async (id, params, options) => {
    return volcanoFetch(getListVariablesUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
export const getCreateVariableUrl = (id) => {
    return `/projects/${id}/variables`;
};
/**
 * Creates a project-level environment variable and triggers asynchronous propagation
 * to deployed functions and frontends in the project's configured regions.
 * @summary Create or update a variable
 */
export const createVariable = async (id, createVariableRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateVariableUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createVariableRequest)
    });
};
;
export const getListDatabasesUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/databases?${stringifiedParams}` : `/projects/${id}/databases`;
};
/**
 * Supports two mutually exclusive pagination modes. Offset mode uses `page`
 * and `limit`. Cursor mode uses `cursor` and `limit`, supports `search`
 * (case-insensitive name match), and returns `next_cursor`/`prev_cursor`.
 * The optional `status` filter applies in both modes and is bound to the
 * cursor. Sending both `page` and `cursor` (or `page` and `search`) returns 400.
 * @summary List all databases for a project
 */
export const listDatabases = async (id, params, options) => {
    return volcanoFetch(getListDatabasesUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
export const getCreateDatabaseUrl = (id) => {
    return `/projects/${id}/databases`;
};
/**
 * Creates a serverless PostgreSQL database in the project.
 * Each project can hold 1 database on Free and up to 10,000 on Pro.
 * Requests over the plan's cap return 403.
 * @summary Create a new serverless PostgreSQL database
 */
export const createDatabase = async (id, createDatabaseRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateDatabaseUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createDatabaseRequest)
    });
};
;
export const getGetDatabaseUrl = (id, databaseName) => {
    return `/projects/${id}/databases/${databaseName}`;
};
/**
 * @summary Get database details
 */
export const getDatabase = async (id, databaseName, options) => {
    return volcanoFetch(getGetDatabaseUrl(id, databaseName), {
        ...options,
        method: 'GET'
    });
};
export const getDeleteDatabaseUrl = (id, databaseName) => {
    return `/projects/${id}/databases/${databaseName}`;
};
/**
 * Deletes a database and the instance backing it. When the instance is
 * removed synchronously the database row is deleted and the response is
 * `204`. If the instance cannot be deleted right away, the database row
 * is retained (status `deleting`) and its teardown is handed to the
 * background reconciler, which retries the deletion and removes the row
 * once the instance is gone; in that case the response is `202`. The database row is
 * never dropped while its instance still exists, so an instance is
 * never orphaned without a record to retry from.
 * @summary Delete a database
 */
export const deleteDatabase = async (id, databaseName, options) => {
    return volcanoFetch(getDeleteDatabaseUrl(id, databaseName), {
        ...options,
        method: 'DELETE'
    });
};
export const getListDatabaseBranchesUrl = (id, databaseName) => {
    return `/projects/${id}/databases/${databaseName}/branches`;
};
/**
 * Returns every branch of the database, including those still provisioning
 * and those that failed, since each still holds a name.
 *
 * Connection strings are omitted. Fetch a single branch to get its
 * connection string.
 * @summary List a database's branches
 */
export const listDatabaseBranches = async (id, databaseName, options) => {
    return volcanoFetch(getListDatabaseBranchesUrl(id, databaseName), {
        ...options,
        method: 'GET'
    });
};
export const getCreateDatabaseBranchUrl = (id, databaseName) => {
    return `/projects/${id}/databases/${databaseName}/branches`;
};
/**
 * Forks the database into a new branch. The branch starts as an exact copy
 * of the parent's data and diverges from there.
 *
 * Provisioning is asynchronous: the response is `202` with the branch in
 * `provisioning` and no connection string. Poll the branch until it reports
 * `active`, at which point it carries its own connection string.
 *
 * Retrying a create with a name that already exists returns `409` rather
 * than a second branch, so a retried request cannot silently consume two
 * slots of the branch allowance.
 * @summary Create a branch of a database
 */
export const createDatabaseBranch = async (id, databaseName, createDatabaseBranchRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateDatabaseBranchUrl(id, databaseName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createDatabaseBranchRequest)
    });
};
export const getGetDatabaseBranchUrl = (id, databaseName, branchName) => {
    return `/projects/${id}/databases/${databaseName}/branches/${branchName}`;
};
/**
 * Returns the branch, including its connection string once it is `active`.
 * Poll this after creating a branch to learn when it is connectable.
 * @summary Get a branch
 */
export const getDatabaseBranch = async (id, databaseName, branchName, options) => {
    return volcanoFetch(getGetDatabaseBranchUrl(id, databaseName, branchName), {
        ...options,
        method: 'GET'
    });
};
export const getUpdateDatabaseBranchUrl = (id, databaseName, branchName) => {
    return `/projects/${id}/databases/${databaseName}/branches/${branchName}`;
};
/**
 * Replaces the branch's lifetime and restarts the countdown from now, so a
 * branch you are still working on is not swept mid-session. The new
 * duration is remembered, so a later reset re-arms the same lifetime.
 * @summary Extend a branch's lifetime
 */
export const updateDatabaseBranch = async (id, databaseName, branchName, updateDatabaseBranchRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateDatabaseBranchUrl(id, databaseName, branchName), {
        ...options,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateDatabaseBranchRequest)
    });
};
export const getDeleteDatabaseBranchUrl = (id, databaseName, branchName) => {
    return `/projects/${id}/databases/${databaseName}/branches/${branchName}`;
};
/**
 * Marks the branch for teardown and returns immediately. The branch stops
 * accepting connections at once; its fork and its row are removed by a
 * background job, so a provider outage cannot leave the call hanging or the
 * branch half-deleted.
 *
 * Deleting a branch that is still provisioning is allowed and stops the
 * build, and repeating the call while teardown is in progress is accepted
 * again. Once the branch is gone the call returns `404`.
 * @summary Delete a branch
 */
export const deleteDatabaseBranch = async (id, databaseName, branchName, options) => {
    return volcanoFetch(getDeleteDatabaseBranchUrl(id, databaseName, branchName), {
        ...options,
        method: 'DELETE'
    });
};
export const getResetDatabaseBranchUrl = (id, databaseName, branchName) => {
    return `/projects/${id}/databases/${databaseName}/branches/${branchName}/reset`;
};
/**
 * Discards everything written on the branch and re-forks it from the
 * parent as it is now.
 *
 * Returns immediately with the branch in `provisioning`. The rewind runs in
 * the background; poll the branch until it reports `active` before
 * connecting again.
 *
 * The branch keeps its name and its connection string, so anything holding
 * that string keeps working once it is active again, and its lifetime is
 * re-armed to the duration it was created with. The branch does not serve
 * connections for the duration of the reset.
 * @summary Reset a branch to its parent's current state
 */
export const resetDatabaseBranch = async (id, databaseName, branchName, options) => {
    return volcanoFetch(getResetDatabaseBranchUrl(id, databaseName, branchName), {
        ...options,
        method: 'POST'
    });
};
export const getResetDatabaseBranchPasswordUrl = (id, databaseName, branchName) => {
    return `/projects/${id}/databases/${databaseName}/branches/${branchName}/reset-password`;
};
/**
 * Issues a new password for the branch and invalidates the previous
 * connection string. Existing connections are not interrupted; new ones
 * must use the returned string. Proxies pick the rotation up within a few
 * seconds, so the previous password can still open new connections until
 * then.
 *
 * The parent database's credentials are untouched.
 * @summary Rotate a branch's password
 */
export const resetDatabaseBranchPassword = async (id, databaseName, branchName, options) => {
    return volcanoFetch(getResetDatabaseBranchPasswordUrl(id, databaseName, branchName), {
        ...options,
        method: 'POST'
    });
};
export const getListDatabaseBackupsUrl = (id, databaseName) => {
    return `/projects/${id}/databases/${databaseName}/backups`;
};
/**
 * Returns every backup of the database, newest first, together with the
 * window a point-in-time restore may target.
 *
 * Both backups you took and backups the schedule produced are listed;
 * `source` tells them apart. Only manual backups count against the plan's
 * backup allowance.
 * @summary List a database's backups
 */
export const listDatabaseBackups = async (id, databaseName, options) => {
    return volcanoFetch(getListDatabaseBackupsUrl(id, databaseName), {
        ...options,
        method: 'GET'
    });
};
export const getCreateDatabaseBackupUrl = (id, databaseName) => {
    return `/projects/${id}/databases/${databaseName}/backups`;
};
/**
 * Captures the database as it is now. The backup is available immediately;
 * its `size_bytes` appears once the storage provider has costed it.
 *
 * Backups are rate-limited to one per minute per database, and capped by
 * the owner's plan.
 * @summary Back up a database
 */
export const createDatabaseBackup = async (id, databaseName, createDatabaseBackupRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateDatabaseBackupUrl(id, databaseName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createDatabaseBackupRequest)
    });
};
export const getGetDatabaseBackupUrl = (id, databaseName, backupName) => {
    return `/projects/${id}/databases/${databaseName}/backups/${backupName}`;
};
/**
 * Returns one backup of the database.
 * @summary Get a backup
 */
export const getDatabaseBackup = async (id, databaseName, backupName, options) => {
    return volcanoFetch(getGetDatabaseBackupUrl(id, databaseName, backupName), {
        ...options,
        method: 'GET'
    });
};
export const getDeleteDatabaseBackupUrl = (id, databaseName, backupName) => {
    return `/projects/${id}/databases/${databaseName}/backups/${backupName}`;
};
/**
 * Deletes the backup and frees its storage. Scheduled backups can be
 * deleted too. A backup that is already gone reports `404`, so a name
 * that never existed and a name that no longer does read the same.
 * Refused with `409` while the database is being restored.
 * @summary Delete a backup
 */
export const deleteDatabaseBackup = async (id, databaseName, backupName, options) => {
    return volcanoFetch(getDeleteDatabaseBackupUrl(id, databaseName, backupName), {
        ...options,
        method: 'DELETE'
    });
};
export const getGetDatabaseBackupScheduleUrl = (id, databaseName) => {
    return `/projects/${id}/databases/${databaseName}/backup-schedule`;
};
/**
 * Returns the database's backup schedule. An empty list means no scheduled
 * backups.
 * @summary Get the automated backup schedule
 */
export const getDatabaseBackupSchedule = async (id, databaseName, options) => {
    return volcanoFetch(getGetDatabaseBackupScheduleUrl(id, databaseName), {
        ...options,
        method: 'GET'
    });
};
export const getUpdateDatabaseBackupScheduleUrl = (id, databaseName) => {
    return `/projects/${id}/databases/${databaseName}/backup-schedule`;
};
/**
 * Replaces the schedule wholesale. Send an empty `entries` list to stop
 * scheduled backups.
 *
 * Scheduled backups do not count against the plan's backup allowance, but
 * their retention is clamped to the plan's.
 * @summary Replace the automated backup schedule
 */
export const updateDatabaseBackupSchedule = async (id, databaseName, databaseBackupSchedule, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateDatabaseBackupScheduleUrl(id, databaseName), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(databaseBackupSchedule)
    });
};
export const getListDatabaseRestoresUrl = (id, databaseName) => {
    return `/projects/${id}/databases/${databaseName}/restores`;
};
/**
 * Returns the database's restore history, newest first, capped at the 50
 * most recent. There is no pagination: a database that has been restored
 * more than 50 times keeps the older records but does not return them.
 * @summary List a database's restores
 */
export const listDatabaseRestores = async (id, databaseName, options) => {
    return volcanoFetch(getListDatabaseRestoresUrl(id, databaseName), {
        ...options,
        method: 'GET'
    });
};
export const getCreateDatabaseRestoreUrl = (id, databaseName) => {
    return `/projects/${id}/databases/${databaseName}/restores`;
};
/**
 * Replaces the database's data, either with a named backup or with its
 * state at a point in time. This is destructive: everything written after
 * that point is discarded.
 *
 * Asynchronous: the response is `202` with the restore `pending` and the
 * database `restoring`. The database does not accept connections until the
 * restore reports `completed`; its connection string is unchanged
 * throughout, so nothing holding it needs updating.
 *
 * Restores are in place. There is no way to restore into a second
 * database, and a database's branches are never restored — they keep
 * serving their own data, but resetting a branch from its parent is
 * refused by the storage provider for up to 24 hours afterwards.
 * @summary Restore a database
 */
export const createDatabaseRestore = async (id, databaseName, createDatabaseRestoreRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateDatabaseRestoreUrl(id, databaseName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createDatabaseRestoreRequest)
    });
};
export const getGetDatabaseRestoreUrl = (id, databaseName, restoreId) => {
    return `/projects/${id}/databases/${databaseName}/restores/${restoreId}`;
};
/**
 * Returns the restore. Poll this after starting one; the database is
 * connectable again once it reports `completed`.
 * @summary Get a restore
 */
export const getDatabaseRestore = async (id, databaseName, restoreId, options) => {
    return volcanoFetch(getGetDatabaseRestoreUrl(id, databaseName, restoreId), {
        ...options,
        method: 'GET'
    });
};
export const getResetDatabasePasswordUrl = (id, databaseName) => {
    return `/projects/${id}/databases/${databaseName}/reset-password`;
};
/**
 * Rotates the Volcano-managed PostgreSQL password used by clients when connecting
 * through pgproxy. This does not rotate or expose the internal owner password.
 * The returned password and connection string are the only client credentials that
 * will authenticate through pgproxy after reset.
 *
 * Existing connections are not interrupted; new ones must use the returned
 * string. Proxies pick the rotation up within a few seconds, so the previous
 * password can still open new connections until then.
 * @summary Reset database password
 */
export const resetDatabasePassword = async (id, databaseName, options) => {
    return volcanoFetch(getResetDatabasePasswordUrl(id, databaseName), {
        ...options,
        method: 'POST'
    });
};
export const getUpdateDatabaseTypeUrl = (id, databaseName) => {
    return `/projects/${id}/databases/${databaseName}/type`;
};
/**
 * Change the size tier of a database. This may briefly interrupt active connections.
 *
 * **Available sizes:**
 * - `volcano-db-xs`: Up to ~1GB RAM - Development, small apps
 * - `volcano-db-s`: Up to ~4GB RAM - Production-ready, light traffic
 * - `volcano-db-m`: Up to ~8GB RAM - Medium traffic applications
 * - `volcano-db-l`: Up to ~16GB RAM - High traffic, larger datasets
 * - `volcano-db-xl`: Up to ~32GB RAM - Heavy workloads
 * - `volcano-db-2xl`: Up to ~64GB RAM - Enterprise-scale
 * @summary Update database size
 */
export const updateDatabaseType = async (id, databaseName, updateDatabaseTypeRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateDatabaseTypeUrl(id, databaseName), {
        ...options,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateDatabaseTypeRequest)
    });
};
export const getGetDatabaseStatsUrl = (id, databaseName, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/databases/${databaseName}/stats?${stringifiedParams}` : `/projects/${id}/databases/${databaseName}/stats`;
};
/**
 * Retrieve consumption metrics including storage, compute time, and data transfer.
 * Metrics are aggregated at the project level. Defaults to last 24 hours.
 *
 * **Note:** Advanced metrics require an upgraded plan.
 * @summary Get database consumption metrics
 */
export const getDatabaseStats = async (id, databaseName, params, options) => {
    return volcanoFetch(getGetDatabaseStatsUrl(id, databaseName, params), {
        ...options,
        method: 'GET'
    });
};
export const getQueryDatabasePingUrl = (databaseName) => {
    return `/databases/${databaseName}/query/ping`;
};
/**
 * Connectivity probe that runs a fixed `SELECT 1` through pgproxy, using the
 * same authentication, status/bandwidth gating, and metering as the other
 * `/query/*` endpoints.
 *
 * Unlike those endpoints, ping takes **no request body** and performs **no
 * table-name validation**, so it works on any database — including a freshly
 * provisioned, empty one. It is a real committed round-trip through pgproxy,
 * so a `200` means the database is reachable and queryable. Used by the
 * dashboard's database connection test.
 * @summary Database connectivity probe (REST API)
 */
export const queryDatabasePing = async (databaseName, options) => {
    return volcanoFetch(getQueryDatabasePingUrl(databaseName), {
        ...options,
        method: 'POST'
    });
};
export const getQueryDatabaseSelectUrl = (databaseName) => {
    return `/databases/${databaseName}/query/select`;
};
/**
 * Query your database using a simple REST API - no SQL required!
 *
 * **Authentication:** Requires auth user access token (from signup/signin)
 *
 * **Row-Level Security:** Automatically enforced - you see only data you have access to
 *
 * **Use Cases:**
 * - Query from browser/mobile apps
 * - Simple data retrieval
 * - Filtered searches with sorting and pagination
 *
 * **Note:** For complex queries (JOINs, CTEs), use functions with direct SQL
 * @summary Query database with SELECT (REST API)
 */
export const queryDatabaseSelect = async (databaseName, databaseSelectRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getQueryDatabaseSelectUrl(databaseName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(databaseSelectRequest)
    });
};
export const getQueryDatabaseInsertUrl = (databaseName) => {
    return `/databases/${databaseName}/query/insert`;
};
/**
 * Insert new rows into your database using REST API.
 *
 * **Authentication:** Requires auth user access token
 *
 * **Auto-set user_id:** If your table has a trigger using `auth.uid()`,
 * user_id will be automatically set to the authenticated user
 *
 * **Security:** Row-Level Security policies are enforced
 * @summary Insert data into database (REST API)
 */
export const queryDatabaseInsert = async (databaseName, databaseInsertRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getQueryDatabaseInsertUrl(databaseName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(databaseInsertRequest)
    });
};
export const getQueryDatabaseUpdateUrl = (databaseName) => {
    return `/databases/${databaseName}/query/update`;
};
/**
 * Update existing rows in your database using REST API.
 *
 * **Security:** Row-Level Security ensures you can only update data you have access to
 *
 * **Safety:** Requires at least one filter to prevent accidental mass updates. A
 * request with no `filters` is rejected with `400` (mirrors delete). This matters
 * for service-key queries, which run with full access and bypass RLS.
 *
 * **Note:** If RLS blocks the update, an empty result is returned (not an error)
 * @summary Update data in database (REST API)
 */
export const queryDatabaseUpdate = async (databaseName, databaseUpdateRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getQueryDatabaseUpdateUrl(databaseName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(databaseUpdateRequest)
    });
};
export const getQueryDatabaseDeleteUrl = (databaseName) => {
    return `/databases/${databaseName}/query/delete`;
};
/**
 * Delete rows from your database using REST API.
 *
 * **Safety:** Requires at least one filter to prevent accidental mass deletions
 *
 * **Security:** Row-Level Security ensures you can only delete data you have access to
 *
 * **Note:** If RLS blocks the delete, an empty result is returned (not an error)
 * @summary Delete data from database (REST API)
 */
export const queryDatabaseDelete = async (databaseName, databaseDeleteRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getQueryDatabaseDeleteUrl(databaseName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(databaseDeleteRequest)
    });
};
export const getQueryDatabaseBranchPingUrl = (databaseName, branchName) => {
    return `/databases/${databaseName}/branches/${branchName}/query/ping`;
};
/**
 * Connectivity probe that runs a fixed `SELECT 1` through pgproxy, using the
 * same authentication, status/bandwidth gating, and metering as the other
 * `/query/*` endpoints.
 *
 * Unlike those endpoints, ping takes **no request body** and performs **no
 * table-name validation**, so it works on any database — including a freshly
 * provisioned, empty one. It is a real committed round-trip through pgproxy,
 * so a `200` means the database is reachable and queryable. Used by the
 * dashboard's database connection test.
 *
 * **Branch-targeted.** Runs against the named branch instead of the parent
 * database, using the branch's own credentials. The branch must be `active`
 * and unexpired. Nothing about this request can reach the parent's data.
 * @summary Database connectivity probe (REST API)
 */
export const queryDatabaseBranchPing = async (databaseName, branchName, options) => {
    return volcanoFetch(getQueryDatabaseBranchPingUrl(databaseName, branchName), {
        ...options,
        method: 'POST'
    });
};
export const getQueryDatabaseBranchSelectUrl = (databaseName, branchName) => {
    return `/databases/${databaseName}/branches/${branchName}/query/select`;
};
/**
 * Query your database using a simple REST API - no SQL required!
 *
 * **Authentication:** Requires auth user access token (from signup/signin)
 *
 * **Row-Level Security:** Automatically enforced - you see only data you have access to
 *
 * **Use Cases:**
 * - Query from browser/mobile apps
 * - Simple data retrieval
 * - Filtered searches with sorting and pagination
 *
 * **Note:** For complex queries (JOINs, CTEs), use Lambda functions with direct SQL
 *
 * **Branch-targeted.** Runs against the named branch instead of the parent
 * database, using the branch's own credentials. The branch must be `active`
 * and unexpired. Nothing about this request can reach the parent's data.
 * @summary Query database with SELECT (REST API)
 */
export const queryDatabaseBranchSelect = async (databaseName, branchName, databaseSelectRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getQueryDatabaseBranchSelectUrl(databaseName, branchName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(databaseSelectRequest)
    });
};
export const getQueryDatabaseBranchInsertUrl = (databaseName, branchName) => {
    return `/databases/${databaseName}/branches/${branchName}/query/insert`;
};
/**
 * Insert new rows into your database using REST API.
 *
 * **Authentication:** Requires auth user access token
 *
 * **Auto-set user_id:** If your table has a trigger using `auth.uid()`,
 * user_id will be automatically set to the authenticated user
 *
 * **Security:** Row-Level Security policies are enforced
 *
 * **Branch-targeted.** Runs against the named branch instead of the parent
 * database, using the branch's own credentials. The branch must be `active`
 * and unexpired. Nothing about this request can reach the parent's data.
 * @summary Insert data into database (REST API)
 */
export const queryDatabaseBranchInsert = async (databaseName, branchName, databaseInsertRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getQueryDatabaseBranchInsertUrl(databaseName, branchName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(databaseInsertRequest)
    });
};
export const getQueryDatabaseBranchUpdateUrl = (databaseName, branchName) => {
    return `/databases/${databaseName}/branches/${branchName}/query/update`;
};
/**
 * Update existing rows in your database using REST API.
 *
 * **Security:** Row-Level Security ensures you can only update data you have access to
 *
 * **Safety:** Requires at least one filter to prevent accidental mass updates. A
 * request with no `filters` is rejected with `400` (mirrors delete). This matters
 * for service-key queries, which run with full access and bypass RLS.
 *
 * **Note:** If RLS blocks the update, an empty result is returned (not an error)
 *
 * **Branch-targeted.** Runs against the named branch instead of the parent
 * database, using the branch's own credentials. The branch must be `active`
 * and unexpired. Nothing about this request can reach the parent's data.
 * @summary Update data in database (REST API)
 */
export const queryDatabaseBranchUpdate = async (databaseName, branchName, databaseUpdateRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getQueryDatabaseBranchUpdateUrl(databaseName, branchName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(databaseUpdateRequest)
    });
};
export const getQueryDatabaseBranchDeleteUrl = (databaseName, branchName) => {
    return `/databases/${databaseName}/branches/${branchName}/query/delete`;
};
/**
 * Delete rows from your database using REST API.
 *
 * **Safety:** Requires at least one filter to prevent accidental mass deletions
 *
 * **Security:** Row-Level Security ensures you can only delete data you have access to
 *
 * **Note:** If RLS blocks the delete, an empty result is returned (not an error)
 *
 * **Branch-targeted.** Runs against the named branch instead of the parent
 * database, using the branch's own credentials. The branch must be `active`
 * and unexpired. Nothing about this request can reach the parent's data.
 * @summary Delete data from database (REST API)
 */
export const queryDatabaseBranchDelete = async (databaseName, branchName, databaseDeleteRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getQueryDatabaseBranchDeleteUrl(databaseName, branchName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(databaseDeleteRequest)
    });
};
;
export const getListDatabaseRegionsUrl = () => {
    return `/databases/regions`;
};
/**
 * Returns the regions enabled for database provisioning in this platform environment.
 * This is a public endpoint that doesn't require authentication.
 * @summary List platform-supported regions for database provisioning
 */
export const listDatabaseRegions = async (options) => {
    return volcanoFetch(getListDatabaseRegionsUrl(), {
        ...options,
        method: 'GET'
    });
};
;
export const getListPostgresVersionsUrl = () => {
    return `/databases/postgres-versions`;
};
/**
 * Returns a list of supported PostgreSQL major versions for database provisioning.
 * This is a public endpoint that doesn't require authentication.
 * @summary List available PostgreSQL versions
 */
export const listPostgresVersions = async (options) => {
    return volcanoFetch(getListPostgresVersionsUrl(), {
        ...options,
        method: 'GET'
    });
};
;
export const getListFunctionRuntimesUrl = () => {
    return `/functions/runtimes`;
};
/**
 * Returns the public function runtime catalog used by CLI clients to select supported runtimes,
 * language defaults, and local source packaging metadata for deployments.
 * This is a public endpoint that doesn't require authentication.
 * @summary List supported function runtimes
 */
export const listFunctionRuntimes = async (options) => {
    return volcanoFetch(getListFunctionRuntimesUrl(), {
        ...options,
        method: 'GET'
    });
};
;
export const getListFunctionRegionsUrl = () => {
    return `/functions/regions`;
};
/**
 * Returns the configured regions where functions can be deployed, each annotated
 * with a human-readable label and country flag emoji for use in UI pickers.
 * This is a public endpoint that doesn't require authentication.
 * @summary List available regions for function deployment
 */
export const listFunctionRegions = async (options) => {
    return volcanoFetch(getListFunctionRegionsUrl(), {
        ...options,
        method: 'GET'
    });
};
export const getGetVariableUrl = (id, name) => {
    return `/projects/${id}/variables/${name}`;
};
/**
 * Returns a project-level environment variable used by deployed functions and frontends.
 * @summary Get variable by name
 */
export const getVariable = async (id, name, options) => {
    return volcanoFetch(getGetVariableUrl(id, name), {
        ...options,
        method: 'GET'
    });
};
export const getUpdateVariableUrl = (id, name) => {
    return `/projects/${id}/variables/${name}`;
};
/**
 * Updates a project-level environment variable and triggers asynchronous propagation
 * to deployed functions and frontends in the project's configured regions.
 * @summary Update a variable
 */
export const updateVariable = async (id, name, updateVariableRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateVariableUrl(id, name), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateVariableRequest)
    });
};
export const getDeleteVariableUrl = (id, name) => {
    return `/projects/${id}/variables/${name}`;
};
/**
 * Deletes a project-level environment variable and triggers asynchronous propagation
 * of the removal to deployed functions and frontends in the project's configured regions.
 * @summary Delete a variable
 */
export const deleteVariable = async (id, name, options) => {
    return volcanoFetch(getDeleteVariableUrl(id, name), {
        ...options,
        method: 'DELETE'
    });
};
export const getAuthGetPasswordPolicyUrl = () => {
    return `/auth/password-policy`;
};
/**
 * Returns the backend-enforced password bounds and compromised-password
 * screening status for the project identified by the anon key. A valid
 * anon key is required, but no route-specific auth permission is needed.
 * @summary Get the effective password policy
 */
export const authGetPasswordPolicy = async (options) => {
    return volcanoFetch(getAuthGetPasswordPolicyUrl(), {
        ...options,
        method: 'GET'
    });
};
export const getAuthSignupUrl = () => {
    return `/auth/signup`;
};
/**
 * Create a new end-user account. The project is determined from the anon key.
 * Requires project-specific anon key in Authorization header.
 *
 * **Session-less**: signup never issues a session. On success it returns a
 * uniform acknowledgement (`AuthSignupResponse`) with no tokens; the client
 * obtains a session with a subsequent `POST /auth/signin`. If email confirmation
 * is enabled for the project, a confirmation email is sent and
 * `confirmation_required` is `true`.
 *
 * **Anti-enumeration**: a signup for an already-registered email returns the
 * exact same `201` response as a fresh signup — it never returns `409` — so the
 * response cannot be used to discover which emails are registered.
 * @summary Sign up a new auth user
 */
export const authSignup = async (authSignupBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthSignupUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authSignupBody)
    });
};
export const getAuthSigninUrl = () => {
    return `/auth/signin`;
};
/**
 * Authenticate with email and password. Requires an anon key.
 *
 * Set `session_mode` to `cookie` to request HttpOnly refresh-token
 * storage. Cookie mode is honored only for an exact, credentialed CORS
 * origin on the same schemeful site as this API. Otherwise the response
 * retains the refresh token in its body.
 * @summary Sign in an auth user
 */
export const authSignin = async (authSigninBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthSigninUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authSigninBody)
    });
};
export const getAuthRefreshUrl = () => {
    return `/auth/refresh`;
};
/**
 * Get a new access token using a refresh token. Requires an anon key.
 *
 * Send `refresh_token` in the body for the default flow. An eligible
 * cookie-mode browser request may instead send `session_mode: cookie`
 * with an empty token or omit the request body; the API reads and resets
 * the project's HttpOnly cookie and omits `refresh_token` from the
 * response.
 * @summary Refresh access token
 */
export const authRefresh = async (authRefreshBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthRefreshUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authRefreshBody)
    });
};
;
export const getAuthLogoutUrl = () => {
    return `/auth/logout`;
};
/**
 * Invalidate a refresh token. Requires an anon key.
 *
 * Send `refresh_token` for the default flow. An eligible cookie-mode
 * browser request may instead send `session_mode: cookie` with an empty
 * token; logout remains idempotent when the cookie is missing or expired.
 * @summary Logout (revoke refresh token)
 */
export const authLogout = async (authLogoutBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthLogoutUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authLogoutBody)
    });
};
export const getAuthForgotPasswordUrl = () => {
    return `/auth/forgot-password`;
};
/**
 * Generates recovery token and stores it (email sending pending).
 * Returns generic message to prevent email enumeration.
 * Project is identified via the anon key.
 * @summary Request password reset
 */
export const authForgotPassword = async (authForgotPasswordBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthForgotPasswordUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authForgotPasswordBody)
    });
};
export const getAuthResetPasswordUrl = () => {
    return `/auth/reset-password`;
};
/**
 * Reset password using recovery token from forgot-password.
 * Revokes all existing sessions for security.
 * @summary Reset password with recovery token
 */
export const authResetPassword = async (authResetPasswordBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthResetPasswordUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authResetPasswordBody)
    });
};
export const getAuthConfirmEmailUrl = () => {
    return `/auth/confirm`;
};
/**
 * Confirm email address using token sent via email.
 * Required if require_email_confirmation is enabled.
 * @summary Confirm email address
 */
export const authConfirmEmail = async (authConfirmEmailBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthConfirmEmailUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authConfirmEmailBody)
    });
};
export const getAuthResendConfirmationUrl = () => {
    return `/auth/resend-confirmation`;
};
/**
 * Resend email confirmation link.
 * Returns generic message to prevent email enumeration.
 * No email is sent when the account does not exist or is already confirmed.
 * If the account exists and is unconfirmed, a new token is generated and
 * any previous confirmation token is invalidated.
 * @summary Resend confirmation email
 */
export const authResendConfirmation = async (authResendConfirmationBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthResendConfirmationUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authResendConfirmationBody)
    });
};
export const getAuthSignupAnonymousUrl = () => {
    return `/auth/signup-anonymous`;
};
/**
 * Create guest user without email/password.
 *
 * User metadata (like display_name) can be included and will appear in realtime presence events.
 * Requires enable_anonymous_signins to be true.
 * @summary Create anonymous user
 */
export const authSignupAnonymous = async (authSignupAnonymousBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthSignupAnonymousUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authSignupAnonymousBody)
    });
};
export const getAuthConvertAnonymousUrl = () => {
    return `/auth/user/convert-anonymous`;
};
/**
 * Add email and password to anonymous user.
 * Requires auth user access token.
 * If require_email_confirmation is enabled for the project, the converted
 * user remains unconfirmed until /auth/confirm succeeds. When email
 * sending is enabled, a confirmation email is sent during conversion.
 * @summary Convert anonymous user to authenticated
 */
export const authConvertAnonymous = async (authConvertAnonymousBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthConvertAnonymousUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authConvertAnonymousBody)
    });
};
export const getAuthRequestEmailChangeUrl = () => {
    return `/auth/user/change-email`;
};
/**
 * Request to change user's email address.
 * Sends confirmation token to new email address.
 * @summary Request email change
 */
export const authRequestEmailChange = async (authRequestEmailChangeBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthRequestEmailChangeUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authRequestEmailChangeBody)
    });
};
export const getAuthConfirmEmailChangeUrl = () => {
    return `/auth/user/confirm-email-change`;
};
/**
 * Confirm email change with token sent to new address
 * @summary Confirm email change
 */
export const authConfirmEmailChange = async (authConfirmEmailChangeBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthConfirmEmailChangeUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authConfirmEmailChangeBody)
    });
};
export const getAuthCancelEmailChangeUrl = () => {
    return `/auth/user/cancel-email-change`;
};
/**
 * @summary Cancel pending email change
 */
export const authCancelEmailChange = async (options) => {
    return volcanoFetch(getAuthCancelEmailChangeUrl(), {
        ...options,
        method: 'DELETE'
    });
};
export const getAuthGetMySessionsUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/auth/user/sessions?${stringifiedParams}` : `/auth/user/sessions`;
};
/**
 * Returns paginated sessions for the currently authenticated user.
 * Each session includes device info, IP addresses, and activity timestamps.
 * The current session is marked with `is_current: true`.
 *
 * **Ordering and pagination.** Without `sort`, results are ordered by most
 * recent activity and paged with `page`/`limit`, returning the
 * `sessions`/`total`/`page`/`limit`/`total_pages` body below. This is the
 * legacy default and is preserved for existing clients.
 *
 * Send `sort=created_at` to opt into the standard list contract: results are
 * ordered by session start (newest first) and may be paged either with
 * `page`/`limit` or by cursor with `cursor`/`ending_before` plus a bounded
 * `offset` past the cursor anchor. Cursor responses use the shared
 * `data` envelope with `next_cursor`/`prev_cursor`.
 *
 * Unlike other list endpoints, sending `limit` without `page` does **not**
 * select cursor mode here; `sort=created_at` is the only opt-in. Cursor
 * pagination is rejected with 400 for the activity order, because
 * `last_activity_at` changes whenever a session refreshes its token: a row
 * that crosses the cursor anchor between two requests would be skipped and
 * never shown. The `status=expired` filter is also offset-only because a
 * session can expire above the cursor anchor during a walk. Sending that
 * filter in cursor mode, `page` with `cursor` or `ending_before`, or both
 * cursor directions returns 400.
 * @summary Get current user's sessions
 */
export const authGetMySessions = async (params, options) => {
    return volcanoFetch(getAuthGetMySessionsUrl(params), {
        ...options,
        method: 'GET'
    });
};
export const getAuthDeleteAllMySessionsUrl = () => {
    return `/auth/user/sessions`;
};
/**
 * Deletes all sessions except the current one.
 * Use this to log out from all other devices while keeping the current session active.
 * @summary Sign out from all other devices
 */
export const authDeleteAllMySessions = async (options) => {
    return volcanoFetch(getAuthDeleteAllMySessionsUrl(), {
        ...options,
        method: 'DELETE'
    });
};
export const getAuthDeleteMySessionUrl = (sessionId) => {
    return `/auth/user/sessions/${sessionId}`;
};
/**
 * Deletes a specific session, logging out that device.
 * You can get session IDs from the list sessions endpoint.
 * @summary Sign out from specific device
 */
export const authDeleteMySession = async (sessionId, options) => {
    return volcanoFetch(getAuthDeleteMySessionUrl(sessionId), {
        ...options,
        method: 'DELETE'
    });
};
export const getAuthGetUserUrl = () => {
    return `/auth/user`;
};
/**
 * Returns authenticated user's profile. Requires access token.
 * @summary Get current user profile
 */
export const authGetUser = async (options) => {
    return volcanoFetch(getAuthGetUserUrl(), {
        ...options,
        method: 'GET'
    });
};
export const getAuthUpdateUserUrl = () => {
    return `/auth/user`;
};
/**
 * Update password or metadata. Requires access token.
 * @summary Update user profile
 */
export const authUpdateUser = async (authUpdateUserBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthUpdateUserUrl(), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authUpdateUserBody)
    });
};
export const getAuthListIdentitiesUrl = () => {
    return `/auth/user/identities`;
};
/**
 * Returns every real email identity the account owns. An account can own
 * multiple identities (for example a password identity plus one or more
 * OAuth identities on different emails). Anonymous accounts have no real
 * identity and return an empty list.
 * @summary List the current user's identities
 */
export const authListIdentities = async (options) => {
    return volcanoFetch(getAuthListIdentitiesUrl(), {
        ...options,
        method: 'GET'
    });
};
export const getAuthUnlinkIdentityUrl = (identityId) => {
    return `/auth/user/identities/${identityId}`;
};
/**
 * Removes a non-primary identity and its attached sign-in methods. Refused
 * when the identity is the account's primary, its only identity, or when
 * removing it would leave the account with no way to sign in.
 * @summary Unlink an identity from the current user
 */
export const authUnlinkIdentity = async (identityId, options) => {
    return volcanoFetch(getAuthUnlinkIdentityUrl(identityId), {
        ...options,
        method: 'DELETE'
    });
};
export const getAuthListMethodsUrl = () => {
    return `/auth/user/methods`;
};
/**
 * Returns a flat list of every sign-in method the account owns (password,
 * each OAuth provider, and any active anonymous method), with the primary
 * method flagged. Password stubs and converted anonymous methods are excluded.
 * @summary List the current user's sign-in methods
 */
export const authListMethods = async (options) => {
    return volcanoFetch(getAuthListMethodsUrl(), {
        ...options,
        method: 'GET'
    });
};
export const getAuthPromoteMethodUrl = (methodId) => {
    return `/auth/user/methods/${methodId}/promote`;
};
/**
 * Promotes the given method to the account's primary sign-in method. The
 * account's canonical email is re-derived from the promoted method's identity.
 * Refused for password stubs and converted anonymous methods, and for an
 * identity whose domain is outside the project's `allowed_email_domains`.
 * @summary Set a method as the account's primary
 */
export const authPromoteMethod = async (methodId, options) => {
    return volcanoFetch(getAuthPromoteMethodUrl(methodId), {
        ...options,
        method: 'POST'
    });
};
export const getGetAuthInsightsUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/auth/insights?${stringifiedParams}` : `/projects/${id}/auth/insights`;
};
/**
 * Returns current auth-user totals, rolling 30-day active users, and
 * zero-filled signup and successful sign-in counts for an inclusive UTC
 * date range. Weeks start on Monday. Sign-in counts and active-user
 * activity begin when collection is deployed. Historical signup counts
 * are backfilled from users present at deployment. Token refreshes affect
 * active users but not the sign-in series.
 * @summary Get auth user insights
 */
export const getAuthInsights = async (id, params, options) => {
    return volcanoFetch(getGetAuthInsightsUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
export const getListAuthUsersUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/auth/users?${stringifiedParams}` : `/projects/${id}/auth/users`;
};
/**
 * List auth users in project. Requires platform token.
 * @summary List all auth users (admin)
 */
export const listAuthUsers = async (id, params, options) => {
    return volcanoFetch(getListAuthUsersUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
;
export const getGetAuthUserUrl = (id, userId) => {
    return `/projects/${id}/auth/users/${userId}`;
};
/**
 * @summary Get specific auth user (admin)
 */
export const getAuthUser = async (id, userId, options) => {
    return volcanoFetch(getGetAuthUserUrl(id, userId), {
        ...options,
        method: 'GET'
    });
};
;
export const getDeleteAuthUserUrl = (id, userId) => {
    return `/projects/${id}/auth/users/${userId}`;
};
/**
 * Soft-deletes user and revokes all sessions
 * @summary Delete auth user (admin)
 */
export const deleteAuthUser = async (id, userId, options) => {
    return volcanoFetch(getDeleteAuthUserUrl(id, userId), {
        ...options,
        method: 'DELETE'
    });
};
export const getListUserSessionsUrl = (id, userId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/auth/users/${userId}/sessions?${stringifiedParams}` : `/projects/${id}/auth/users/${userId}/sessions`;
};
/**
 * List paginated sessions for a specific auth user.
 * Returns session details including device info, IP address, and activity timestamps.
 *
 * Ordering and pagination match `GET /auth/user/sessions`: the default is
 * activity order with `page`/`limit` and the legacy `sessions` body, and
 * `sort=created_at` opts into the standard cursor/offset hybrid with the
 * shared `data` envelope. Cursor pagination is only available for
 * `sort=created_at`, because the activity timestamp changes under paging.
 * The `status=expired` filter is offset-only because sessions can expire
 * above a cursor anchor during a walk.
 * @summary List user sessions
 */
export const listUserSessions = async (id, userId, params, options) => {
    return volcanoFetch(getListUserSessionsUrl(id, userId, params), {
        ...options,
        method: 'GET'
    });
};
export const getDeleteAllUserSessionsUrl = (id, userId) => {
    return `/projects/${id}/auth/users/${userId}/sessions`;
};
/**
 * Revokes all sessions for a user, forcing them to re-authenticate on all devices.
 * Use this to log out a user from everywhere.
 * @summary Delete all user sessions
 */
export const deleteAllUserSessions = async (id, userId, options) => {
    return volcanoFetch(getDeleteAllUserSessionsUrl(id, userId), {
        ...options,
        method: 'DELETE'
    });
};
export const getDeleteUserSessionUrl = (id, userId, sessionId) => {
    return `/projects/${id}/auth/users/${userId}/sessions/${sessionId}`;
};
/**
 * Revokes a specific session for a user.
 * Use this to log out a user from a single device.
 * @summary Delete specific session
 */
export const deleteUserSession = async (id, userId, sessionId, options) => {
    return volcanoFetch(getDeleteUserSessionUrl(id, userId, sessionId), {
        ...options,
        method: 'DELETE'
    });
};
export const getBanAuthUserUrl = (id, userId) => {
    return `/projects/${id}/auth/users/${userId}/ban`;
};
/**
 * Bans a user temporarily or permanently. Banned users cannot sign in
 * and all their active sessions are immediately revoked.
 *
 * - Omit `banned_until` for a permanent ban
 * - Provide `banned_until` ISO timestamp for a temporary ban
 * @summary Ban a user
 */
export const banAuthUser = async (id, userId, banAuthUserBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getBanAuthUserUrl(id, userId), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(banAuthUserBody)
    });
};
export const getUnbanAuthUserUrl = (id, userId) => {
    return `/projects/${id}/auth/users/${userId}/unban`;
};
/**
 * Removes a ban from a user, restoring their ability to sign in.
 * The user's status is set back to 'active'.
 * @summary Unban a user
 */
export const unbanAuthUser = async (id, userId, options) => {
    return volcanoFetch(getUnbanAuthUserUrl(id, userId), {
        ...options,
        method: 'POST'
    });
};
;
export const getListEmailTemplatesUrl = (id) => {
    return `/projects/${id}/email-templates`;
};
/**
 * Returns all custom email templates for this project.
 * @summary List email templates
 */
export const listEmailTemplates = async (id, options) => {
    return volcanoFetch(getListEmailTemplatesUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getCreateEmailTemplateUrl = (id) => {
    return `/projects/${id}/email-templates`;
};
/**
 * Creates a custom email template for the project. Custom email templates
 * are a PRO-plan feature: requests from a FREE-plan project owner are
 * rejected with 403, and FREE projects always send the built-in default
 * templates regardless of any previously saved custom rows.
 * Every project is created with one template per type, so customizing one
 * is usually a PUT; creating a type the project already has returns 409.
 * Valid template types: welcome, confirmation, password_reset, password_changed
 * @summary Create email template
 */
export const createEmailTemplate = async (id, createEmailTemplateRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateEmailTemplateUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createEmailTemplateRequest)
    });
};
export const getGetEmailTemplateUrl = (id, type) => {
    return `/projects/${id}/email-templates/${type}`;
};
/**
 * @summary Get email template
 */
export const getEmailTemplate = async (id, type, options) => {
    return volcanoFetch(getGetEmailTemplateUrl(id, type), {
        ...options,
        method: 'GET'
    });
};
export const getUpdateEmailTemplateUrl = (id, type) => {
    return `/projects/${id}/email-templates/${type}`;
};
/**
 * Updates a custom email template. Custom email templates are a PRO-plan
 * feature: requests from a FREE-plan project owner are rejected with 403
 * (including after a PRO→FREE downgrade), so a FREE project cannot modify
 * templates and always sends the built-in defaults.
 * @summary Update email template
 */
export const updateEmailTemplate = async (id, type, updateEmailTemplateRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateEmailTemplateUrl(id, type), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateEmailTemplateRequest)
    });
};
export const getDeleteEmailTemplateUrl = (id, type) => {
    return `/projects/${id}/email-templates/${type}`;
};
/**
 * Deletes a custom template, reverting to the default. Custom email
 * templates are a PRO-plan feature: requests from a FREE-plan project owner
 * are rejected with 403.
 * @summary Delete email template
 */
export const deleteEmailTemplate = async (id, type, options) => {
    return volcanoFetch(getDeleteEmailTemplateUrl(id, type), {
        ...options,
        method: 'DELETE'
    });
};
;
export const getGetDefaultEmailTemplatesUrl = () => {
    return `/email-templates/defaults`;
};
/**
 * Returns the default email templates used when no custom template is configured.
 * @summary Get default email templates
 */
export const getDefaultEmailTemplates = async (options) => {
    return volcanoFetch(getGetDefaultEmailTemplatesUrl(), {
        ...options,
        method: 'GET'
    });
};
export const getGetDefaultEmailTemplateUrl = (type) => {
    return `/email-templates/defaults/${type}`;
};
/**
 * @summary Get default email template by type
 */
export const getDefaultEmailTemplate = async (type, options) => {
    return volcanoFetch(getGetDefaultEmailTemplateUrl(type), {
        ...options,
        method: 'GET'
    });
};
;
export const getGetAuthConfigUrl = (id) => {
    return `/projects/${id}/auth/config`;
};
/**
 * @summary Get auth configuration
 */
export const getAuthConfig = async (id, options) => {
    return volcanoFetch(getGetAuthConfigUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getUpdateAuthConfigUrl = (id) => {
    return `/projects/${id}/auth/config`;
};
/**
 * Updates the project's auth configuration. Only the fields present in
 * the body are changed.
 * @summary Update auth configuration
 */
export const updateAuthConfig = async (id, updateAuthConfigRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateAuthConfigUrl(id), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateAuthConfigRequest)
    });
};
export const getTestEmailConfigUrl = (id) => {
    return `/projects/${id}/auth/config/test-email`;
};
/**
 * Sends a diagnostic email to `to_email` using the project's
 * persisted `auth_config` SMTP credentials. If `html_body` or
 * `text_body` is supplied, the override path is taken: those
 * values (plus optional `subject`) are rendered through
 * html/text templates against the project's `Data` and
 * used as the body — used by the template editor's "Send Test"
 * affordance to preview an unsaved template. With both bodies
 * omitted, a hardcoded diagnostic message is sent and any
 * `subject` field is ignored. Sending `subject` alone (no
 * bodies) is rejected with 400 to avoid a silently-dropped
 * subject or a blank message. Also rejects with 400 if
 * `email_enabled=false` or `smtp_host` is empty.
 * @summary Send a test email using the project's saved SMTP config
 */
export const testEmailConfig = async (id, testEmailRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getTestEmailConfigUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(testEmailRequest)
    });
};
;
export const getGetAuthHostedPageUrl = (id, pageType) => {
    return `/projects/${id}/auth/hosted-pages/${pageType}`;
};
/**
 * Returns the saved HTML/CSS for the page type, or `page: null` when the
 * project has not customized it yet. Always returns `defaults` (the theme
 * shell to seed an editor with, which is valid input to the update endpoint)
 * and `runtime` (the script the rendered page runs, plus a preview harness).
 * @summary Get hosted auth page
 */
export const getAuthHostedPage = async (id, pageType, options) => {
    return volcanoFetch(getGetAuthHostedPageUrl(id, pageType), {
        ...options,
        method: 'GET'
    });
};
export const getUpdateAuthHostedPageUrl = (id, pageType) => {
    return `/projects/${id}/auth/hosted-pages/${pageType}`;
};
/**
 * Saves the current HTML/CSS for this page type.
 * Security validation rejects script tags, javascript: URLs, inline event handlers, iframe/object/embed/meta/link tags in HTML,
 * and closing style/head tags in CSS.
 * @summary Update hosted auth page
 */
export const updateAuthHostedPage = async (id, pageType, updateAuthHostedPageRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateAuthHostedPageUrl(id, pageType), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateAuthHostedPageRequest)
    });
};
export const getGetAuthPageAppearanceUrl = (id) => {
    return `/projects/${id}/auth/pages/appearance`;
};
/**
 * @summary Get managed auth page appearance
 */
export const getAuthPageAppearance = async (id, options) => {
    return volcanoFetch(getGetAuthPageAppearanceUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getUpdateAuthPageThemeUrl = (id) => {
    return `/projects/${id}/auth/pages/theme`;
};
/**
 * @summary Save the managed auth page theme
 */
export const updateAuthPageTheme = async (id, updateAuthPageThemeRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateAuthPageThemeUrl(id), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateAuthPageThemeRequest)
    });
};
export const getDeleteAuthPageThemeUrl = (id) => {
    return `/projects/${id}/auth/pages/theme`;
};
/**
 * @summary Clear the managed auth page theme
 */
export const deleteAuthPageTheme = async (id, options) => {
    return volcanoFetch(getDeleteAuthPageThemeUrl(id), {
        ...options,
        method: 'DELETE'
    });
};
export const getUpdateAuthPageLayoutUrl = (id, pageType) => {
    return `/projects/${id}/auth/pages/${pageType}/layout`;
};
/**
 * @summary Save one managed auth page layout
 */
export const updateAuthPageLayout = async (id, pageType, updateAuthPageLayoutRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateAuthPageLayoutUrl(id, pageType), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateAuthPageLayoutRequest)
    });
};
export const getDeleteAuthPageLayoutUrl = (id, pageType) => {
    return `/projects/${id}/auth/pages/${pageType}/layout`;
};
/**
 * @summary Clear one managed auth page layout
 */
export const deleteAuthPageLayout = async (id, pageType, options) => {
    return volcanoFetch(getDeleteAuthPageLayoutUrl(id, pageType), {
        ...options,
        method: 'DELETE'
    });
};
export const getPreviewAuthPageUrl = (id, pageType) => {
    return `/projects/${id}/auth/pages/${pageType}/preview`;
};
/**
 * @summary Preview an unsaved managed auth page appearance
 */
export const previewAuthPage = async (id, pageType, previewAuthPageRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getPreviewAuthPageUrl(id, pageType), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(previewAuthPageRequest)
    });
};
export const getRenderManagedAuthPageUrl = (id, pageType) => {
    return `/projects/${id}/auth/hosted/${pageType}`;
};
/**
 * Public HTML endpoint for signup, forgot-password, device approval,
 * verify-email, and reset-password pages. Login uses the path without a
 * page type.
 * Requires `Accept: text/html`.
 * Returns 404 when managed hosted pages are disabled for the project.
 * @summary Render a managed auth page
 */
export const renderManagedAuthPage = async (id, pageType, options) => {
    return volcanoFetch(getRenderManagedAuthPageUrl(id, pageType), {
        ...options,
        method: 'GET'
    });
};
export const getRenderDefaultManagedAuthPageUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/auth/hosted?${stringifiedParams}` : `/projects/${id}/auth/hosted`;
};
/**
 * Public HTML endpoint for the managed login page.
 * Requires `Accept: text/html`.
 * @summary Render default managed auth page
 */
export const renderDefaultManagedAuthPage = async (id, params, options) => {
    return volcanoFetch(getRenderDefaultManagedAuthPageUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
export const getGetHostedLoginOptionsUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/auth/hosted/login/options?${stringifiedParams}` : `/projects/${id}/auth/hosted/login/options`;
};
/**
 * Returns runtime options for the built-in managed login flow.
 * Requires `anon_key` query parameter.
 * Rate limited per project and client IP. Excess requests return `429` and `Retry-After`.
 * @summary Get hosted login runtime options
 */
export const getHostedLoginOptions = async (id, params, options) => {
    return volcanoFetch(getGetHostedLoginOptionsUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
export const getHostedLoginCheckEmailUrl = (id) => {
    return `/projects/${id}/auth/hosted/login/check-email`;
};
/**
 * Used by the built-in managed login page to branch UI between signin and signup.
 * Requires anon key in Authorization header.
 * Rate limited per project and client IP. Excess requests return `429` and `Retry-After`.
 * @summary Check whether email exists for hosted login flow
 */
export const hostedLoginCheckEmail = async (id, hostedLoginEmailCheckRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getHostedLoginCheckEmailUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(hostedLoginEmailCheckRequest)
    });
};
;
export const getGetAuthMethodsUrl = (id) => {
    return `/projects/${id}/auth/methods`;
};
/**
 * Returns all configured authentication methods for this project,
 * including email/password, anonymous, device authorization, and OAuth providers.
 * @summary Get all authentication methods
 */
export const getAuthMethods = async (id, options) => {
    return volcanoFetch(getGetAuthMethodsUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getConfigureAuthMethodsUrl = (id) => {
    return `/projects/${id}/auth/methods`;
};
/**
 * Configure all authentication methods in a single request.
 * At least one method must remain enabled.
 * @summary Configure authentication methods (unified)
 */
export const configureAuthMethods = async (id, configureAuthMethodsBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getConfigureAuthMethodsUrl(id), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(configureAuthMethodsBody)
    });
};
;
export const getListOAuthConfigsUrl = (id) => {
    return `/projects/${id}/oauth/configs`;
};
/**
 * List all OAuth provider configurations for this project
 * @summary List OAuth configurations
 */
export const listOAuthConfigs = async (id, options) => {
    return volcanoFetch(getListOAuthConfigsUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getCreateOAuthConfigUrl = (id) => {
    return `/projects/${id}/oauth/configs`;
};
/**
 * Configure OAuth provider (Google, GitHub, Microsoft, Apple, Device)
 * @summary Create OAuth configuration
 */
export const createOAuthConfig = async (id, createOAuthConfigRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateOAuthConfigUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createOAuthConfigRequest)
    });
};
;
export const getGetOAuthConfigUrl = (id, provider, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/oauth/configs/${provider}?${stringifiedParams}` : `/projects/${id}/oauth/configs/${provider}`;
};
/**
 * @summary Get OAuth configuration
 */
export const getOAuthConfig = async (id, provider, params, options) => {
    return volcanoFetch(getGetOAuthConfigUrl(id, provider, params), {
        ...options,
        method: 'GET'
    });
};
;
export const getUpdateOAuthConfigUrl = (id, provider, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/oauth/configs/${provider}?${stringifiedParams}` : `/projects/${id}/oauth/configs/${provider}`;
};
/**
 * @summary Update OAuth configuration
 */
export const updateOAuthConfig = async (id, provider, updateOAuthConfigRequest, params, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateOAuthConfigUrl(id, provider, params), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateOAuthConfigRequest)
    });
};
;
export const getDeleteOAuthConfigUrl = (id, provider, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/oauth/configs/${provider}?${stringifiedParams}` : `/projects/${id}/oauth/configs/${provider}`;
};
/**
 * @summary Delete OAuth configuration
 */
export const deleteOAuthConfig = async (id, provider, params, options) => {
    return volcanoFetch(getDeleteOAuthConfigUrl(id, provider, params), {
        ...options,
        method: 'DELETE'
    });
};
;
export const getListAvailableOAuthProvidersUrl = (id) => {
    return `/projects/${id}/oauth/providers`;
};
/**
 * Get list of supported OAuth providers and their default scopes
 * @summary List available OAuth providers
 */
export const listAvailableOAuthProviders = async (id, options) => {
    return volcanoFetch(getListAvailableOAuthProvidersUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getAuthOAuthAuthorizeUrl = (provider, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/auth/oauth/${provider}/authorize?${stringifiedParams}` : `/auth/oauth/${provider}/authorize`;
};
/**
 * Redirects user to OAuth provider for authorization.
 * Handles CSRF protection with state parameter.
 * Project is identified via the anon_key query parameter.
 * @summary Start OAuth authorization
 */
export const authOAuthAuthorize = async (provider, params, options) => {
    return volcanoFetch(getAuthOAuthAuthorizeUrl(provider, params), {
        ...options,
        method: 'GET'
    });
};
export const getAuthOAuthCallbackUrl = (provider, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/auth/oauth/${provider}/callback?${stringifiedParams}` : `/auth/oauth/${provider}/callback`;
};
/**
 * Handles OAuth provider callback with authorization code.
 * Exchanges code for tokens and creates/signs in user.
 * @summary OAuth callback handler
 */
export const authOAuthCallback = async (provider, params, options) => {
    return volcanoFetch(getAuthOAuthCallbackUrl(provider, params), {
        ...options,
        method: 'GET'
    });
};
export const getAuthOAuthExchangeUrl = () => {
    return `/auth/oauth/exchange`;
};
/**
 * Atomically consumes a short-lived callback code and returns the user's
 * session. The request must use the same project anon key and exact
 * redirect_url that initiated the flow.
 * @summary Exchange OAuth authorization code
 */
export const authOAuthExchange = async (authOAuthExchangeBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthOAuthExchangeUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authOAuthExchangeBody)
    });
};
export const getAuthDeviceAuthorizeUrl = () => {
    return `/auth/device/authorize`;
};
/**
 * Starts OAuth 2.0 Device Authorization Grant (RFC 8628).
 * Returns `device_code` for the CLI and `user_code` for browser verification.
 *
 * By default the returned `verification_uri` / `verification_uri_complete`
 * point at the project's managed device-approval page served by this API
 * (`/projects/{projectId}/auth/hosted?action=device&user_code=...&anon_key=...`),
 * which requires managed auth enabled and a default anon key for the
 * project.
 *
 * Projects can override this by setting `device_verification_url` on the
 * auth config (`PATCH /auth/config`). When set, that URL is returned as-is
 * with the `user_code` appended (no `action=device` hint and no embedded
 * anon key — the page brings its own), so a CLI's `login` command surfaces
 * the project's own RFC 8628 approval page. With a custom URL, device login
 * does **not** require managed auth to be enabled; the custom page's origin
 * must be in the project's auth CORS allowlist to call
 * `POST /auth/device/verify`. Either way the verification page must
 * authenticate the end user and call `POST /auth/device/verify` with the
 * `user_code`. See the device-auth guide for both approaches.
 * @summary Start RFC8628 device authorization
 */
export const authDeviceAuthorize = async (authDeviceAuthorizeBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthDeviceAuthorizeUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authDeviceAuthorizeBody)
    });
};
export const getAuthDeviceTokenUrl = () => {
    return `/auth/device/token`;
};
/**
 * RFC8628 token polling endpoint.
 * Returns OAuth errors such as `authorization_pending`, `slow_down`, `access_denied`, and `expired_token`.
 * @summary Poll device token endpoint
 */
export const authDeviceToken = async (authDeviceTokenBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthDeviceTokenUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authDeviceTokenBody)
    });
};
export const getAuthDeviceVerifyUrl = () => {
    return `/auth/device/verify`;
};
/**
 * Browser-side endpoint for authenticated auth-users to approve (`approve`) or deny (`deny`) a `user_code`.
 *
 * Called by the verification page after the end user signs in. The grant is
 * scoped to the project the auth-user token belongs to: approving a
 * `user_code` issued for a different project returns `403`. This endpoint
 * does not require managed auth to be enabled, so a custom verification page
 * (hosted anywhere) can drive approval — it just needs an authenticated
 * project auth-user access token and, for cross-origin browser calls, the
 * page origin allowed in the project's auth CORS settings.
 * @summary Approve or deny a device code
 */
export const authDeviceVerify = async (authDeviceVerifyBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthDeviceVerifyUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authDeviceVerifyBody)
    });
};
export const getAuthPlatformExchangeUrl = () => {
    return `/auth/platform/exchange`;
};
/**
 * Exchanges a verified auth-user device-flow session into a platform token for CLI usage.
 * The target platform user is derived from authenticated auth-user mapping; client cannot select another user.
 * @summary Exchange auth-user device session for platform token
 */
export const authPlatformExchange = async (authPlatformExchangeBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAuthPlatformExchangeUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(authPlatformExchangeBody)
    });
};
export const getAuthListOAuthProvidersUrl = () => {
    return `/auth/oauth/providers`;
};
/**
 * Get list of OAuth providers linked to current user
 * @summary List user's linked providers
 */
export const authListOAuthProviders = async (options) => {
    return volcanoFetch(getAuthListOAuthProvidersUrl(), {
        ...options,
        method: 'GET'
    });
};
export const getAuthLinkOAuthProviderUrl = (provider, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/auth/oauth/${provider}/link?${stringifiedParams}` : `/auth/oauth/${provider}/link`;
};
/**
 * Generates authorization URL to link OAuth provider to existing account.
 * User must be authenticated.
 * @summary Link OAuth provider to current user
 */
export const authLinkOAuthProvider = async (provider, params, options) => {
    return volcanoFetch(getAuthLinkOAuthProviderUrl(provider, params), {
        ...options,
        method: 'POST'
    });
};
export const getAuthUnlinkOAuthProviderUrl = (provider) => {
    return `/auth/oauth/${provider}/unlink`;
};
/**
 * Remove OAuth provider from user's account.
 * Cannot unlink if it's the only authentication method.
 * @summary Unlink OAuth provider
 */
export const authUnlinkOAuthProvider = async (provider, options) => {
    return volcanoFetch(getAuthUnlinkOAuthProviderUrl(provider), {
        ...options,
        method: 'DELETE'
    });
};
export const getRefreshOAuthProviderTokenUrl = (provider) => {
    return `/auth/oauth/${provider}/refresh-token`;
};
/**
 * Refresh the access token for an OAuth provider using its refresh token.
 * Allows calling provider APIs on user's behalf (e.g., Google Drive, GitHub repos).
 * @summary Refresh OAuth provider token
 */
export const refreshOAuthProviderToken = async (provider, options) => {
    return volcanoFetch(getRefreshOAuthProviderTokenUrl(provider), {
        ...options,
        method: 'POST'
    });
};
export const getGetOAuthProviderTokenUrl = (provider) => {
    return `/auth/oauth/${provider}/token`;
};
/**
 * Get valid access token for OAuth provider.
 * Automatically refreshes if expired.
 * @summary Get current provider access token
 */
export const getOAuthProviderToken = async (provider, options) => {
    return volcanoFetch(getGetOAuthProviderTokenUrl(provider), {
        ...options,
        method: 'GET'
    });
};
export const getCallOAuthProviderAPIUrl = (provider) => {
    return `/auth/oauth/${provider}/call-api`;
};
/**
 * Make an authenticated request to an OAuth provider's API on behalf of the user.
 * The user's stored access token is automatically used and refreshed if needed.
 *
 * The request is always sent to the provider's fixed API base URL joined with
 * the caller-supplied `endpoint`. `endpoint` must be a relative path beginning
 * with `/` (optionally with a query string); it cannot change the target host.
 * Absolute URLs, protocol-relative `//host` values, or userinfo (`@host`) are
 * rejected with `400` so the request can never be redirected to another host.
 *
 * Examples of `endpoint`:
 * - Google userinfo: `/oauth2/v1/userinfo`
 * - GitHub repositories: `/user/repos`
 * - Microsoft Graph profile: `/me`
 *
 * The response is the raw JSON response from the provider's API.
 * @summary Call OAuth provider API
 */
export const callOAuthProviderAPI = async (provider, callOAuthProviderAPIBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCallOAuthProviderAPIUrl(provider), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(callOAuthProviderAPIBody)
    });
};
;
export const getListAnonKeysUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/anon-keys?${stringifiedParams}` : `/projects/${id}/anon-keys`;
};
/**
 * Supports two mutually exclusive pagination modes. Offset mode uses `page`
 * and `limit` and is the default when neither `cursor` nor `search` is
 * supplied (first page, default `limit`). Cursor mode uses `cursor` and
 * `limit`, supports `search` (case-insensitive name match), and returns
 * `next_cursor`. Sending both `page` and `cursor` (or `page` and `search`)
 * returns 400.
 * @summary List anon keys
 */
export const listAnonKeys = async (id, params, options) => {
    return volcanoFetch(getListAnonKeysUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
;
export const getCreateAnonKeyUrl = (id) => {
    return `/projects/${id}/anon-keys`;
};
/**
 * @summary Create anon key
 */
export const createAnonKey = async (id, createAnonKeyBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateAnonKeyUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createAnonKeyBody)
    });
};
export const getGetAnonKeyUrl = (id, keyId) => {
    return `/projects/${id}/anon-keys/${keyId}`;
};
/**
 * Get details of a specific anon key
 * @summary Get anon key
 */
export const getAnonKey = async (id, keyId, options) => {
    return volcanoFetch(getGetAnonKeyUrl(id, keyId), {
        ...options,
        method: 'GET'
    });
};
export const getRevokeAnonKeyUrl = (id, keyId) => {
    return `/projects/${id}/anon-keys/${keyId}`;
};
/**
 * Revokes key - it will immediately stop working
 * @summary Revoke anon key
 */
export const revokeAnonKey = async (id, keyId, options) => {
    return volcanoFetch(getRevokeAnonKeyUrl(id, keyId), {
        ...options,
        method: 'DELETE'
    });
};
;
export const getRegenerateAnonKeyUrl = (id, keyId) => {
    return `/projects/${id}/anon-keys/${keyId}/regenerate`;
};
/**
 * Generate new JWT value for existing key
 * @summary Regenerate anon key
 */
export const regenerateAnonKey = async (id, keyId, options) => {
    return volcanoFetch(getRegenerateAnonKeyUrl(id, keyId), {
        ...options,
        method: 'POST'
    });
};
export const getSetDefaultAnonKeyUrl = (id, keyId) => {
    return `/projects/${id}/anon-keys/${keyId}/set-default`;
};
/**
 * Promotes the given key to the project's configured default. At most one key per project can be default.
 * @summary Set default anon key
 */
export const setDefaultAnonKey = async (id, keyId, options) => {
    return volcanoFetch(getSetDefaultAnonKeyUrl(id, keyId), {
        ...options,
        method: 'POST'
    });
};
;
export const getListServiceKeysUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/service-keys?${stringifiedParams}` : `/projects/${id}/service-keys`;
};
/**
 * List all service role keys for a project with pagination.
 *
 * **WARNING:** Service keys bypass RLS - for backend/admin use only!
 * @summary List service keys (paginated)
 */
export const listServiceKeys = async (id, params, options) => {
    return volcanoFetch(getListServiceKeysUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
export const getCreateServiceKeyUrl = (id) => {
    return `/projects/${id}/service-keys`;
};
/**
 * Create a new service role key for admin operations.
 *
 * **WARNING:** Service keys bypass all RLS policies!
 * Store securely and NEVER expose in frontend code.
 * @summary Create service key
 */
export const createServiceKey = async (id, createServiceKeyBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateServiceKeyUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createServiceKeyBody)
    });
};
export const getGetServiceKeyUrl = (id, keyId) => {
    return `/projects/${id}/service-keys/${keyId}`;
};
/**
 * Get details of a specific service key
 * @summary Get service key
 */
export const getServiceKey = async (id, keyId, options) => {
    return volcanoFetch(getGetServiceKeyUrl(id, keyId), {
        ...options,
        method: 'GET'
    });
};
;
export const getDeleteServiceKeyUrl = (id, keyId) => {
    return `/projects/${id}/service-keys/${keyId}`;
};
/**
 * Permanently delete a service key.
 * Any services using this key will immediately lose access.
 * @summary Delete service key
 */
export const deleteServiceKey = async (id, keyId, options) => {
    return volcanoFetch(getDeleteServiceKeyUrl(id, keyId), {
        ...options,
        method: 'DELETE'
    });
};
;
export const getRegenerateServiceKeyUrl = (id, keyId) => {
    return `/projects/${id}/service-keys/${keyId}/regenerate`;
};
/**
 * Generate new JWT value for existing key.
 * The old key is immediately invalidated.
 * Update your backend services with the new key before regenerating in production.
 * @summary Regenerate service key
 */
export const regenerateServiceKey = async (id, keyId, options) => {
    return volcanoFetch(getRegenerateServiceKeyUrl(id, keyId), {
        ...options,
        method: 'POST'
    });
};
;
export const getListStorageBucketsUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/storage/buckets?${stringifiedParams}` : `/projects/${id}/storage/buckets`;
};
/**
 * With no pagination params, returns the full bucket list as a bare array
 * (legacy). Supplying `cursor`, `ending_before`, `search`, or `limit`
 * switches to keyset (cursor) pagination and returns a paginated envelope
 * with `next_cursor`/`prev_cursor` and a filtered `total`.
 * @summary List all storage buckets in a project
 */
export const listStorageBuckets = async (id, params, options) => {
    return volcanoFetch(getListStorageBucketsUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
export const getCreateStorageBucketUrl = (id) => {
    return `/projects/${id}/storage/buckets`;
};
/**
 * @summary Create a new storage bucket
 */
export const createStorageBucket = async (id, createStorageBucketRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateStorageBucketUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createStorageBucketRequest)
    });
};
export const getGetStorageBucketUrl = (id, bucketName) => {
    return `/projects/${id}/storage/buckets/${bucketName}`;
};
/**
 * @summary Get storage bucket by name
 */
export const getStorageBucket = async (id, bucketName, options) => {
    return volcanoFetch(getGetStorageBucketUrl(id, bucketName), {
        ...options,
        method: 'GET'
    });
};
;
export const getUpdateStorageBucketUrl = (id, bucketName) => {
    return `/projects/${id}/storage/buckets/${bucketName}`;
};
/**
 * @summary Update storage bucket settings
 */
export const updateStorageBucket = async (id, bucketName, updateStorageBucketRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateStorageBucketUrl(id, bucketName), {
        ...options,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateStorageBucketRequest)
    });
};
;
export const getDeleteStorageBucketUrl = (id, bucketName) => {
    return `/projects/${id}/storage/buckets/${bucketName}`;
};
/**
 * @summary Delete storage bucket and all objects
 */
export const deleteStorageBucket = async (id, bucketName, options) => {
    return volcanoFetch(getDeleteStorageBucketUrl(id, bucketName), {
        ...options,
        method: 'DELETE'
    });
};
;
export const getListStoragePoliciesUrl = (id, bucketName) => {
    return `/projects/${id}/storage/buckets/${bucketName}/policies`;
};
/**
 * @summary List storage policies for a bucket
 */
export const listStoragePolicies = async (id, bucketName, options) => {
    return volcanoFetch(getListStoragePoliciesUrl(id, bucketName), {
        ...options,
        method: 'GET'
    });
};
;
export const getCreateStoragePolicyUrl = (id, bucketName) => {
    return `/projects/${id}/storage/buckets/${bucketName}/policies`;
};
/**
 * @summary Create a storage policy
 */
export const createStoragePolicy = async (id, bucketName, createStoragePolicyRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCreateStoragePolicyUrl(id, bucketName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(createStoragePolicyRequest)
    });
};
;
export const getDeleteStoragePolicyUrl = (id, bucketName, policyId) => {
    return `/projects/${id}/storage/buckets/${bucketName}/policies/${policyId}`;
};
/**
 * @summary Delete a storage policy
 */
export const deleteStoragePolicy = async (id, bucketName, policyId, options) => {
    return volcanoFetch(getDeleteStoragePolicyUrl(id, bucketName, policyId), {
        ...options,
        method: 'DELETE'
    });
};
;
export const getListStorageObjectsAdminUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/storage/objects?${stringifiedParams}` : `/projects/${id}/storage/objects`;
};
/**
 * Returns a paginated list of all storage objects across all buckets in the project.
 * Supports filtering by owner and pagination.
 * @summary List all storage objects in a project
 */
export const listStorageObjectsAdmin = async (id, params, options) => {
    return volcanoFetch(getListStorageObjectsAdminUrl(id, params), {
        ...options,
        method: 'GET'
    });
};
;
export const getGetStorageStatsUrl = (id) => {
    return `/projects/${id}/storage/stats`;
};
/**
 * Returns aggregate storage statistics including bucket count, object count, and total size.
 * @summary Get storage statistics for a project
 */
export const getStorageStats = async (id, options) => {
    return volcanoFetch(getGetStorageStatsUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getGetRealtimeConfigUrl = (id) => {
    return `/projects/${id}/realtime/config`;
};
/**
 * Returns the realtime configuration including enabled features and limits.
 * @summary Get realtime configuration for a project
 */
export const getRealtimeConfig = async (id, options) => {
    return volcanoFetch(getGetRealtimeConfigUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getUpdateRealtimeConfigUrl = (id) => {
    return `/projects/${id}/realtime/config`;
};
/**
 * Updates realtime settings including feature toggles and limits.
 * @summary Update realtime configuration for a project
 */
export const updateRealtimeConfig = async (id, updateRealtimeConfigRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateRealtimeConfigUrl(id), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(updateRealtimeConfigRequest)
    });
};
export const getGetRealtimeStatsUrl = (id) => {
    return `/projects/${id}/realtime/stats`;
};
/**
 * Returns realtime usage statistics including connection counts and subscribed tables.
 * @summary Get realtime statistics for a project
 */
export const getRealtimeStats = async (id, options) => {
    return volcanoFetch(getGetRealtimeStatsUrl(id), {
        ...options,
        method: 'GET'
    });
};
export const getListStorageObjectsUrl = (bucketName, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/storage/${bucketName}?${stringifiedParams}` : `/storage/${bucketName}`;
};
/**
 * @summary List objects in a bucket
 */
export const listStorageObjects = async (bucketName, params, options) => {
    return volcanoFetch(getListStorageObjectsUrl(bucketName, params), {
        ...options,
        method: 'GET'
    });
};
export const getAcquireProjectLockUrl = (key) => {
    return `/locks/${key}/lease`;
};
/**
 * Acquires a project-scoped lease using the project embedded in the service-role key.
 * The caller must hold the `locks.manage` permission. Repeating the request with the
 * same lock token is idempotent and resets that lease to the requested TTL. A different
 * live owner receives `409 lock_held`; a caller whose own lease already lapsed receives
 * `409 lock_ownership_lost`.
 * @summary Acquire a project lock
 */
export const acquireProjectLock = async (key, projectLockLeaseRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getAcquireProjectLockUrl(key), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(projectLockLeaseRequest)
    });
};
export const getRenewProjectLockUrl = (key) => {
    return `/locks/${key}/lease`;
};
/**
 * Renews a lease owned by the supplied lock token. The request must arrive
 * more than one second before `expires_at`; this safety margin prevents
 * clock skew between regional API instances from resurrecting an expired
 * lease.
 * @summary Renew a project lock
 */
export const renewProjectLock = async (key, projectLockLeaseRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getRenewProjectLockUrl(key), {
        ...options,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(projectLockLeaseRequest)
    });
};
export const getReleaseProjectLockUrl = (key) => {
    return `/locks/${key}/lease`;
};
/**
 * Releases a lease only when the supplied lock token still owns it.
 * @summary Release a project lock
 */
export const releaseProjectLock = async (key, options) => {
    return volcanoFetch(getReleaseProjectLockUrl(key), {
        ...options,
        method: 'DELETE'
    });
};
export const getGetProjectLockUrl = (key) => {
    return `/locks/${key}`;
};
/**
 * Reports whether the lock is currently held, when its lease expires, and the
 * holder's fencing token. `held` follows takeover eligibility rather than raw
 * expiry, so `held: false` means an acquire would succeed now. No lock token is
 * required, making this usable for monitoring and recovery.
 * @summary Read a project lock
 */
export const getProjectLock = async (key, options) => {
    return volcanoFetch(getGetProjectLockUrl(key), {
        ...options,
        method: 'GET'
    });
};
export const getForceReleaseProjectLockUrl = (key) => {
    return `/locks/${key}`;
};
/**
 * Drops the lease whatever token holds it, for recovering a lock whose holder
 * died without releasing. Use `DELETE /locks/{key}/lease` for normal release.
 *
 * This breaks mutual exclusion by itself: the previous holder keeps working
 * until its own renewal fails. Guard the protected resource with the lease's
 * `fencing_token`, which the next acquisition raises, so a write from the
 * displaced holder can be rejected. Succeeds when the lock is already absent.
 * @summary Force release a project lock
 */
export const forceReleaseProjectLock = async (key, options) => {
    return volcanoFetch(getForceReleaseProjectLockUrl(key), {
        ...options,
        method: 'DELETE'
    });
};
export const getMoveStorageObjectUrl = (bucketName) => {
    return `/storage/${bucketName}/move`;
};
/**
 * @summary Move/rename an object
 */
export const moveStorageObject = async (bucketName, storageMoveRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getMoveStorageObjectUrl(bucketName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(storageMoveRequest)
    });
};
export const getCopyStorageObjectUrl = (bucketName) => {
    return `/storage/${bucketName}/copy`;
};
/**
 * @summary Copy an object
 */
export const copyStorageObject = async (bucketName, storageCopyRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getCopyStorageObjectUrl(bucketName), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(storageCopyRequest)
    });
};
export const getUploadStorageObjectUrl = (bucketName, path) => {
    return `/storage/${bucketName}/${path}`;
};
/**
 * Unified endpoint for file uploads. Behavior depends on Content-Type and headers:
 *
 * **Simple Upload (multipart/form-data):**
 * Upload a complete file in a single request. Best for files under 100MB.
 *
 * **Create Resumable Session (application/json):**
 * Create a session for chunked uploads. Best for large files or unreliable networks.
 * Requires: `Content-Type: application/json` with body `{"filename": "...", "content_type": "...", "total_size": ...}`
 *
 * **Complete Resumable Session:**
 * Complete a session after all parts are uploaded.
 * Requires: `X-Upload-Session` header with session ID and `X-Upload-Complete: true` header.
 *
 * **Resumable Session Ownership:**
 * A session created with a user access token remains bound to that user. A session
 * created with an anon key remains bound to that exact anon key. Reuse the same
 * identity or anon key for part uploads, status, completion, and abort requests;
 * an ownership mismatch returns `404`.
 * @summary Upload a file or create resumable session
 */
export const uploadStorageObject = async (bucketName, path, uploadStorageObjectBodyOne, options) => {
    const formData = new FormData();
    formData.append(`file`, uploadStorageObjectBodyOne.file);
    return volcanoFetch(getUploadStorageObjectUrl(bucketName, path), {
        ...options,
        method: 'POST',
        body: formData
    });
};
export const getUploadPartUrl = (bucketName, path) => {
    return `/storage/${bucketName}/${path}`;
};
/**
 * Upload a single part of a resumable upload session.
 *
 * **Requirements:**
 * - Part numbers start at 1
 * - All parts except the last must be at least 5MB
 * - Maximum part size is 25MB
 * - Parts can be uploaded in any order
 * - Re-uploading a part overwrites the previous upload
 * - Anonymous sessions must reuse the exact anon key that created the session
 * @summary Upload a part of a resumable upload
 */
export const uploadPart = async (bucketName, path, uploadPartBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUploadPartUrl(bucketName, path), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream', ...getHeaders(options?.headers) },
        body: uploadPartBody
    });
};
export const getDownloadStorageObjectUrl = (bucketName, path) => {
    return `/storage/${bucketName}/${path}`;
};
/**
 * Download a file, or get the status of a resumable upload session.
 *
 * **File Download (default):**
 * Downloads the file at the specified path.
 *
 * **Session Status (with X-Upload-Session header):**
 * Returns the status of a resumable upload session, including which parts have been uploaded.
 * Anonymous sessions must reuse the exact anon key that created the session.
 * @summary Download a file or get upload session status
 */
export const downloadStorageObject = async (bucketName, path, options) => {
    return volcanoFetch(getDownloadStorageObjectUrl(bucketName, path), {
        ...options,
        method: 'GET'
    });
};
export const getDeleteStorageObjectUrl = (bucketName, path) => {
    return `/storage/${bucketName}/${path}`;
};
/**
 * Delete a file, or abort a resumable upload session.
 *
 * **File Delete (default):**
 * Deletes the file at the specified path.
 *
 * **Abort Session (with X-Upload-Session header):**
 * Aborts a resumable upload session and cleans up any uploaded parts.
 * Anonymous sessions must reuse the exact anon key that created the session.
 * @summary Delete a file or abort upload session
 */
export const deleteStorageObject = async (bucketName, path, options) => {
    return volcanoFetch(getDeleteStorageObjectUrl(bucketName, path), {
        ...options,
        method: 'DELETE'
    });
};
export const getUpdateStorageObjectVisibilityUrl = (bucketName, path) => {
    return `/storage/${bucketName}/${path}/visibility`;
};
/**
 * Change whether a file is publicly accessible. Only the file owner or a service key can change visibility.
 * If the bucket defines UPDATE policies, the owner must also satisfy one of them.
 *
 * - Public files can be downloaded with just an anon key (no user authentication required)
 * - Private files (default) require authentication and must pass policy checks
 * - All downloads go through the Volcano API - there is no direct access to the underlying store
 * @summary Update file visibility (public/private)
 */
export const updateStorageObjectVisibility = async (bucketName, path, storageVisibilityRequest, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getUpdateStorageObjectVisibilityUrl(bucketName, path), {
        ...options,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(storageVisibilityRequest)
    });
};
export const getDownloadPublicFileUrl = (projectId, bucketName, path) => {
    return `/public/${projectId}/${bucketName}/${path}`;
};
/**
 * Download a file that has been marked as public. This endpoint requires NO authentication.
 *
 * **Access Requirements:**
 * - The file must have `is_public: true` set via the visibility endpoint
 * - Private files will return 403 Forbidden
 *
 * **Use Cases:**
 * - Shareable public URLs for profile pictures, public documents, etc.
 * - Embedding public files on external websites
 * - Direct linking without requiring SDK or authentication
 *
 * **URL Format:**
 * ```
 * GET /public/{projectId}/{bucketName}/{path}
 * ```
 *
 * **Example:**
 * ```
 * https://api.volcano.dev/public/abc123/avatars/user-photo.jpg
 * ```
 *
 * **CORS:**
 * This endpoint allows all origins since the file is already public.
 * @summary Download a public file (no authentication required)
 */
export const downloadPublicFile = async (projectId, bucketName, path, options) => {
    return volcanoFetch(getDownloadPublicFileUrl(projectId, bucketName, path), {
        ...options,
        method: 'GET'
    });
};
;
export const getHealthCheckUrl = () => {
    return `/health`;
};
/**
 * Returns server health status. Used for load balancer and monitoring checks.
 * @summary Health check endpoint
 */
export const healthCheck = async (options) => {
    return volcanoFetch(getHealthCheckUrl(), {
        ...options,
        method: 'GET'
    });
};
