export const normalizeBaseUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TypeError('baseUrl is required');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch (error) {
    throw new TypeError('baseUrl must be a valid HTTP or HTTPS URL', { cause: error });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('baseUrl must use HTTP or HTTPS');
  }
  if (url.search || url.hash) {
    throw new TypeError('baseUrl must not include a query string or fragment');
  }

  let pathname = url.pathname;
  while (pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  url.pathname = pathname;

  const normalized = url.toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
};
