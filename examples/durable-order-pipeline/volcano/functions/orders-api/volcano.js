// The clients orders-api calls Volcano with, and the helper that reads their
// results. A key is checked when a client needs it, as the SDK checks it, so a
// missing one fails only the requests that use it.
const { VolcanoClient } = require('@volcano.dev/sdk');

/**
 * @import { QueryResult } from '@volcano.dev/sdk'
 */

const { VOLCANO_API_URL, VOLCANO_ANON_KEY, VOLCANO_SERVICE_KEY } = process.env;

/**
 * A database client that acts with `accessToken`.
 *
 * @param {string} accessToken
 */
function client(accessToken) {
  const { VOLCANO_DATABASE } = process.env;
  return new VolcanoClient({
    apiUrl: VOLCANO_API_URL,
    anonKey: required('VOLCANO_ANON_KEY', VOLCANO_ANON_KEY),
    accessToken,
  }).database(isMissing(VOLCANO_DATABASE) ? 'app' : VOLCANO_DATABASE);
}

// Built without an access token, so the start speaks for the service key rather
// than for the signed-in user.
function starter() {
  return new VolcanoClient({
    apiUrl: VOLCANO_API_URL,
    anonKey: serviceKey(),
  });
}

function serviceKey() {
  return required('VOLCANO_SERVICE_KEY', VOLCANO_SERVICE_KEY);
}

/**
 * @param {string} name
 * @param {string | undefined} value
 */
function required(name, value) {
  if (isMissing(value)) {
    throw new Error(`set ${name}`);
  }
  return value;
}

/**
 * An unset variable and an empty one are both missing.
 *
 * @param {string | undefined} value
 * @returns {value is undefined | ''}
 */
function isMissing(value) {
  return value === undefined || value === '';
}

/**
 * @template Row
 * @param {QueryResult<Row>} result
 * @returns {Row[]}
 */
function unwrap({ data, error }) {
  if (error !== null) {
    throw new Error(error.message);
  }
  return data ?? [];
}

module.exports = { client, serviceKey, starter, unwrap };
