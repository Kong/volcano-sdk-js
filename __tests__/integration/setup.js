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
  const apiUrl = process.env.VOLCANO_API_URL || 'http://localhost:8000';
  const mgmtUrl = process.env.VOLCANO_MGMT_URL || 'http://localhost:8001';

  console.log(`Integration tests configured:`);
  console.log(`  API URL: ${apiUrl}`);
  console.log(`  Management URL: ${mgmtUrl}`);
});
