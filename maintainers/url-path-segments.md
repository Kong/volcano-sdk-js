# URL path segments

The SDK builds request URLs by putting caller values into path templates.
`encodeURIComponent` escapes `/`, `?`, `#`, and `\`, but it leaves `.` and `..`
unchanged. `fetch` and `new URL()` follow the
[URL Standard](https://url.spec.whatwg.org/#single-dot-path-segment), which
removes those segments. It also removes them when they are written `%2e` or
`%2e%2e`. A caller value of `..` therefore sends the request, and the session's
bearer token, to a different API route. This is client-side path traversal; see
Doyensec's [CSPT whitepaper](https://www.doyensec.com/resources/Doyensec_CSPT2CSRF_Whitepaper.pdf).

When code puts a caller value into a URL path:

- Build the segment with `pathSegment` from `src/path-segments.ts`. It
  percent-encodes the value and refuses a blank value, `.`, `..`, and any value
  that contains `/`. It also refuses a lone UTF-16 surrogate, for which
  `encodeURIComponent` would throw `URIError`. Report its error through the
  method's normal error result.
  Do not percent-encode the dots instead, because URL parsing treats `%2e`
  segments as dots. An empty value can turn an item route into its collection
  route: `deleteSession('')` would address `/auth/user/sessions/`.
- Encoding does not make `/` safe. Hosting's router matches the decoded path, so
  `%2F` is a separator there: `database('main/branches/dev')` would reach the
  database branch routes. Hosting bucket, database and function names, and its
  UUIDs, never contain `/`.
- `pathSegment` refuses non-string values. Bucket names, database names and
  `deleteSession` IDs use `convertedPathSegment`, which first converts numbers,
  bigints and booleans with `String()`. Those sites used to pass the value
  straight to `encodeURIComponent`, which did the same, so JavaScript callers such
  as `storage.from(2024)` keep working.
- Values that already have a stricter format can skip the check. Sandbox IDs are
  UUIDs, function hosts are DNS labels, and lock keys start with a letter or digit.
  Sign-out revocation takes its session ID from the access token, where
  `extractSessionIdFromToken` accepts only a UUID.
- Generated functions in `src/generated/client.ts` insert their arguments without
  encoding. Pass them values that are already validated and encoded.

Storage object paths keep `/` as a separator. `storageTargetError` in
`src/storage-paths.ts` applies the bucket rule above and refuses a path with an
empty, `.`, or `..` segment (`hasUnsafeSegment`). It allows one leading `/` on a
path, which `bucketRelativePath` drops from URLs and from `move()`/`copy()`
bodies. Hosting already ignores one leading slash in object URLs and refuses
object keys that start with `/`, so no stored key depends on it. The `list()`
prefix is a query parameter, so these rules do not apply to it.

## Upstream behavior

No URL library refuses these segments for an API client, so the check is local.
Peer storage clients differ:

- Supabase `storage-js` strips leading, trailing, and repeated `/` in
  `_removeEmptyFolders` and `_getFinalPath`. It leaves `.` and `..` to the server.
- Firebase Storage encodes the whole object path, including `/`, as one segment.
- Cloud Storage does not allow objects named `.` or `..`, and Amazon S3 recommends
  avoiding period-only segments in object keys.
