import { apiRequestError } from './api-errors.ts';
import { safeJsonParse } from './response-json.ts';

export interface StorageRequestOptions extends RequestInit {
  responseType?: 'blob';
}

export type StorageFetcher = (url: string, options: StorageRequestOptions) => Promise<Response>;

export interface StorageRequestResult {
  data: unknown;
  error: Error | null;
}

/** Parse storage responses at the HTTP boundary, including binary downloads. */
export async function storageRequest(
  fetcher: StorageFetcher,
  url: string,
  options: StorageRequestOptions = {},
): Promise<StorageRequestResult> {
  try {
    const response = await fetcher(url, options);
    if (options.responseType === 'blob') {
      return await blobResult(response);
    }
    return await jsonResult(response);
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Request failed') };
  }
}

async function blobResult(response: Response): Promise<StorageRequestResult> {
  if (!response.ok) {
    return { data: null, error: apiRequestError(response, await safeJsonParse(response)) };
  }
  return { data: await response.blob(), error: null };
}

async function jsonResult(response: Response): Promise<StorageRequestResult> {
  const data = await safeJsonParse(response);
  return response.ok
    ? { data, error: null }
    : { data: null, error: apiRequestError(response, data) };
}
