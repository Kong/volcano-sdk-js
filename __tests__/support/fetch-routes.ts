import { fetchPath } from '../auth-concurrency-fixtures.ts';

type FetchRoute = (init: RequestInit | undefined) => Promise<Response>;

/**
 * A fetch double that answers each request from the route for its URL path.
 * A request to any other path rejects, so an unexpected call fails the test.
 */
export function fetchRoutes(routes: Readonly<Record<string, FetchRoute>>): typeof fetch {
  const table = new Map(Object.entries(routes));
  return (input, init) => {
    const path = fetchPath(input);
    const route = table.get(path);
    if (route === undefined) {
      return Promise.reject(new Error(`Unexpected fetch to ${path}`));
    }
    return route(init);
  };
}
