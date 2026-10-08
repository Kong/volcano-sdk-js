export type PathSegment = { segment: string; error: null } | { segment: null; error: Error };

export const UNSAFE_SEGMENTS = 'cannot contain empty, ".", or ".." segments';

/**
 * encodeURIComponent leaves "." and ".." unchanged, and URL parsers remove them
 * as relative path segments. Encoding the dots would not help: WHATWG URL also
 * treats "%2e" and "%2e%2e" as dot segments. An empty segment can turn an item
 * route into its collection route.
 */
export function hasUnsafeSegment(value: string): boolean {
  return value.split('/').some((part) => part === '' || part === '.' || part === '..');
}

const LONE_SURROGATE = /\p{Surrogate}/u;

/** encodeURIComponent throws URIError for a lone UTF-16 surrogate, so report it first. */
export function hasLoneSurrogate(value: string): boolean {
  return LONE_SURROGATE.test(value);
}

/** Hosting routes on the decoded path, so an encoded "/" still separates segments there. */
function isUnsafeName(value: string): boolean {
  return value === '.' || value === '..' || value.includes('/');
}

/** Encode a caller value as one URL path segment, or say why it cannot be one. */
export function pathSegment(name: string, value: unknown): PathSegment {
  if (typeof value !== 'string' || value.trim() === '') {
    return { segment: null, error: new Error(`${name} must be a non-empty string`) };
  }
  if (isUnsafeName(value)) {
    return { segment: null, error: new Error(`${name} cannot contain "/" or be "." or ".."`) };
  }
  if (hasLoneSurrogate(value)) {
    return { segment: null, error: new Error(`${name} is not well-formed Unicode`) };
  }
  return { segment: encodeURIComponent(value), error: null };
}

const CONVERTED_TYPES = new Set(['number', 'bigint', 'boolean']);

/**
 * pathSegment for a name the SDK used to pass straight to encodeURIComponent,
 * which converted numbers, bigints and booleans. JavaScript callers keep that.
 */
export function convertedPathSegment(name: string, value: unknown): PathSegment {
  return pathSegment(name, CONVERTED_TYPES.has(typeof value) ? String(value) : value);
}
