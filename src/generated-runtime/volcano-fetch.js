async function readBody(response) {
    const contentType = response.headers.get('content-type')?.toLowerCase();
    if (isJsonContentType(contentType) || typeof response.blob !== 'function') {
        return response.json();
    }
    if (isTextContentType(contentType)) {
        return response.text();
    }
    return response.blob();
}
function isJsonContentType(contentType) {
    return contentType?.includes('json') === true;
}
function isTextContentType(contentType) {
    return contentType?.startsWith('text/') === true;
}
async function responseData(response, responseType) {
    if ([204, 205, 304].includes(response.status)) {
        return undefined;
    }
    if (response.ok && responseType === 'blob') {
        return response.blob();
    }
    return readBody(response);
}
function responseError(response, data) {
    const message = errorMessage(response.status, data);
    const error = Object.assign(new Error(message), { info: data, status: response.status });
    if (hasErrorCode(data)) {
        Object.assign(error, { code: data.code });
    }
    const retryAfter = retryDelay(response);
    if (retryAfter !== undefined) {
        Object.assign(error, { retryAfter });
    }
    return error;
}
function retryDelay(response) {
    const seconds = Number.parseInt(String(response.headers.get('retry-after')), 10);
    return Number.isFinite(seconds) ? seconds : undefined;
}
function hasErrorCode(data) {
    return typeof data === 'object' && data !== null && 'code' in data;
}
function errorMessage(status, data) {
    if (typeof data === 'object' && data !== null && 'error' in data) {
        return String(data.error);
    }
    return `Request failed with status ${String(status)}`;
}
export async function volcanoFetch(path, options) {
    const { volcanoAuthorization, volcanoClient, volcanoResponseType, ...request } = options;
    if (volcanoClient === undefined || volcanoAuthorization === undefined) {
        throw new Error('Generated transport requires a Volcano client and authorization mode');
    }
    const response = await volcanoClient._generatedFetch(path, request, volcanoAuthorization);
    const data = await responseData(response, volcanoResponseType);
    if (!response.ok) {
        throw responseError(response, data);
    }
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-type-assertion -- Orval supplies T; preserve its generated response contract.
    return { data, status: response.status, headers: response.headers };
}
