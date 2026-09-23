/**
 * Integration test setup
 *
 * These tests run against a real Volcano Hosting server.
 * Required environment variables:
 * - VOLCANO_API_URL: The API server URL (default: http://localhost:8000)
 * - VOLCANO_MGMT_URL: The management server URL (default: http://localhost:8001)
 */

// Increase timeout for integration tests
jest.setTimeout(120000);

// Validate required environment
beforeAll(() => {
  const configuredApiUrl = process.env['VOLCANO_API_URL'];
  const configuredMgmtUrl = process.env['VOLCANO_MGMT_URL'];
  const apiUrl =
    configuredApiUrl === undefined || configuredApiUrl === ''
      ? 'http://localhost:8000'
      : configuredApiUrl;
  const mgmtUrl =
    configuredMgmtUrl === undefined || configuredMgmtUrl === ''
      ? 'http://localhost:8001'
      : configuredMgmtUrl;

  console.log(`Integration tests configured:`);
  console.log(`  API URL: ${apiUrl}`);
  console.log(`  Management URL: ${mgmtUrl}`);
});
