import { volcanoFetch } from '../volcano-fetch';
export const getStartDurableExecutionFromApplicationUrl = (functionId) => {
    return `/durable-functions/${functionId}/executions`;
};
/**
 * Starts an execution of a durable function using an application
 * credential, and returns its handle.
 *
 * This is the durable counterpart of `POST /functions/{functionId}/invoke`,
 * and it is the endpoint an application calls. Like that one, it is not
 * project-scoped: an anon key, a service key and an auth user token each
 * carry their own project. The project-scoped collection under
 * `/projects/{id}/durable-functions/...` remains the owner's management
 * surface.
 *
 * **With a service key or an auth user token:** any durable function in
 * the project.
 *
 * **With an anon key:** requires the `functions.invoke` permission, and
 * the function must have `is_public: true`.
 *
 * Starting is all this endpoint does. Reading a result or stopping an
 * execution requires the project owner's token, because an anon key is
 * shared by everyone who loads the page and an execution is addressed by
 * id alone.
 *
 * Send `X-Volcano-Execution-Name` to make the start idempotent: repeating
 * a start with the same name returns the existing execution instead of
 * beginning a second one.
 *
 * Each execution counts once against the project's durable execution
 * allowance, however many times the start is retried under the same
 * execution name, and the number in flight at once is capped by the plan.
 * The operations the execution performs are counted against the durable
 * operations allowance when it finishes.
 * @summary Start a durable execution from an application
 */
export const startDurableExecutionFromApplication = async (functionId, startDurableExecutionFromApplicationBody, options) => {
    const getHeaders = (h) => {
        if (!h)
            return {};
        if (h instanceof Headers)
            return Object.fromEntries(h.entries());
        if (Array.isArray(h))
            return Object.fromEntries(h);
        return h;
    };
    return volcanoFetch(getStartDurableExecutionFromApplicationUrl(functionId), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
        body: JSON.stringify(startDurableExecutionFromApplicationBody)
    });
};
export const getListDurableExecutionsUrl = (id, functionId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : String(value));
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/projects/${id}/durable-functions/${functionId}/executions?${stringifiedParams}` : `/projects/${id}/durable-functions/${functionId}/executions`;
};
/**
 * Returns the platform's last observed status for each execution; listing
 * does not poll each one. Fetch a single execution for its live state.
 * @summary List a durable function's executions
 */
export const listDurableExecutions = async (id, functionId, params, options) => {
    return volcanoFetch(getListDurableExecutionsUrl(id, functionId, params), {
        ...options,
        method: 'GET'
    });
};
export const getGetDurableExecutionUrl = (id, functionId, executionId) => {
    return `/projects/${id}/durable-functions/${functionId}/executions/${executionId}`;
};
/**
 * Returns the execution's current state, including its `result` once it has
 * succeeded. Poll this to wait for an execution to finish.
 * @summary Get a durable execution
 */
export const getDurableExecution = async (id, functionId, executionId, options) => {
    return volcanoFetch(getGetDurableExecutionUrl(id, functionId, executionId), {
        ...options,
        method: 'GET'
    });
};
export const getStopDurableExecutionUrl = (id, functionId, executionId) => {
    return `/projects/${id}/durable-functions/${functionId}/executions/${executionId}/stop`;
};
/**
 * Cancels a running execution. Its completed steps are not undone.
 *
 * The call is accepted rather than awaited: cancellation happens behind
 * it, so the response reports the execution as it was read back and may
 * still say `running`. Do not branch on that status — the execution
 * settles into `stopped` shortly after, and polling
 * `GET /projects/{id}/durable-functions/{functionId}/executions/{executionId}`
 * is how you see it get there.
 *
 * Stopping an execution that already finished is not an error: the
 * response carries the state it settled in.
 * @summary Stop a durable execution
 */
export const stopDurableExecution = async (id, functionId, executionId, options) => {
    return volcanoFetch(getStopDurableExecutionUrl(id, functionId, executionId), {
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
export const getAuthSigninUrl = () => {
    return `/auth/signin`;
};
/**
 * Authenticate with email and password. Requires an anon key.
 *
 * Set `session_mode` to `cookie` to request HttpOnly refresh-token
 * storage. Cookie mode is honored only for an exact, credentialed CORS
 * origin on the same schemeful site as this API. Otherwise the response
 * retains the refresh token in its body. A frontend on its default
 * Volcano URL is cross-site with this API and so always gets the body
 * token.
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
