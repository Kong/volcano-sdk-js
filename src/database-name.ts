import { convertedPathSegment, type PathSegment } from './path-segments.ts';

/** Encode the database name as its URL path segment, refusing values a URL parser would resolve. */
export function databaseSegment(databaseName: unknown): PathSegment {
  if (databaseName === null || databaseName === undefined || databaseName === '') {
    return {
      segment: null,
      error: new Error('Database name not set. Use .database(databaseName) first.'),
    };
  }
  return convertedPathSegment('Database name', databaseName);
}
