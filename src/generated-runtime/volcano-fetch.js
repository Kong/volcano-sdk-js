async function responseData(response, responseType) {
    if ([204, 205, 304].includes(response.status)) {
        return undefined;
    }
    if (response.ok && responseType === 'blob') {
        return response.blob();
    }
    const contentType = (response.headers?.get?.('content-type') || '').toLowerCase();
    if (contentType.includes('json') || typeof response.blob !== 'function') {
        return response.json();
    }
    if (contentType.startsWith('text/')) {
        return response.text();
    }
    return response.blob();
}
export async function volcanoFetch(path, options) {
    const { volcanoAuthorization, volcanoClient, volcanoResponseType, ...request } = options;
    if (!volcanoClient || !volcanoAuthorization) {
        throw new Error('Generated transport requires a Volcano client and authorization mode');
    }
    const response = await volcanoClient._generatedFetch(path, request, volcanoAuthorization);
    const data = await responseData(response, volcanoResponseType);
    if (!response.ok) {
        const message = typeof data === 'object' && data !== null && 'error' in data
            ? String(data.error)
            : `Request failed with status ${response.status}`;
        const error = new Error(message);
        error.info = data;
        error.status = response.status;
        if (typeof data === 'object' && data !== null && 'code' in data) {
            Object.assign(error, { code: data.code });
        }
        const retryAfter = Number.parseInt(response.headers?.get?.('retry-after') || '', 10);
        if (Number.isFinite(retryAfter)) {
            Object.assign(error, { retryAfter });
        }
        throw error;
    }
    return { data, status: response.status, headers: response.headers };
}
