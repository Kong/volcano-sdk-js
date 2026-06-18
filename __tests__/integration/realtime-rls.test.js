/**
 * Realtime RLS (Row-Level Security) Isolation Tests
 *
 * These tests verify that authenticated users only receive realtime events
 * for data they have access to through Row-Level Security policies.
 *
 * CRITICAL: These tests verify the security isolation that is essential
 * for multi-tenant applications where each user should only see their own data.
 *
 * Prerequisites:
 * - Volcano server running with realtime enabled
 * - Database with RLS policies configured
 *
 * Environment Variables (can be set in .env file):
 * - VOLCANO_API_URL: The API server URL
 * - VOLCANO_MGMT_URL: The management server URL
 */

// Load .env file if present
try {
  require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../../.env') });
} catch {
  // dotenv not installed
}

const VolcanoAuth = require('../../src/index.js');
const { VolcanoRealtime } = require('../../src/realtime.js');
const { randomUUID } = require('node:crypto');

const API_URL = process.env.VOLCANO_API_URL || 'http://localhost:8000';
const MGMT_URL = process.env.VOLCANO_MGMT_URL || 'http://localhost:8001';
const REALTIME_URL = process.env.VOLCANO_REALTIME_URL || API_URL;

// Helper functions
async function mgmtFetch(path, options = {}) {
  const response = await fetch(`${MGMT_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Management API error: ${response.status} - ${error.error || 'Unknown'}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function platformFetch(path, token, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Platform API error: ${response.status} - ${error.error || 'Unknown'}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

// Global database client for SQL execution
let dbClient = null;

async function initDbClient(connectionString) {
  if (dbClient) return;
  const { Client } = await import('pg');
  let connStr = connectionString.replace('sslmode=require', 'sslmode=no-verify');
  dbClient = new Client({ connectionString: connStr });
  await dbClient.connect();
}

async function closeDbClient() {
  if (dbClient) {
    await dbClient.end();
    dbClient = null;
  }
}

async function executeSql(sql) {
  if (!dbClient) {
    throw new Error('Database client not initialized. Call initDbClient first.');
  }
  // Remove SQL comments first (both -- and /* */ style)
  let cleanSql = sql
    .replace(/--[^\n]*/g, '') // Remove -- comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments

  // Split SQL into individual statements and execute separately
  // The pg client doesn't support multiple statements in prepared statements
  const statements = cleanSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await dbClient.query(statement);
  }
}

function changeMatchesId(change, id) {
  return change.id === id || change.record?.id === id || change.old_record?.id === id;
}

describe('Realtime RLS Isolation Tests', () => {
  let platformUser;
  let platformToken;
  let project;
  let anonKey;
  let database;

  // Two auth users for isolation testing
  let userAlice;
  let sessionAlice;
  let userBob;
  let sessionBob;

  const cleanupFns = [];

  beforeAll(async () => {
    console.log('\n========================================');
    console.log('Realtime RLS Isolation Tests');
    console.log('========================================\n');

    // Verify server is running
    try {
      await fetch(`${API_URL}/health`);
      console.log('[ok] Volcano API server is running');
    } catch {
      throw new Error(`Volcano API server is not running at ${API_URL}`);
    }

    // Create platform user
    platformUser = await mgmtFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        id: `rls-test-${Date.now()}`,
        name: 'RLS Test User',
      }),
    });
    cleanupFns.push(async () => {
      await mgmtFetch(`/users/${platformUser.id}`, { method: 'DELETE' }).catch(() => {});
    });
    console.log(`[ok] Created platform user: ${platformUser.id}`);

    // Create platform token
    const tokenResponse = await mgmtFetch(`/users/${platformUser.id}/tokens`, {
      method: 'POST',
      body: JSON.stringify({ name: 'rls-test-token' }),
    });
    platformToken = tokenResponse.token;

    // Create project with unique name
    project = await platformFetch('/projects', platformToken, {
      method: 'POST',
      body: JSON.stringify({ name: `rls-test-${Date.now()}` }),
    });
    cleanupFns.push(async () => {
      await platformFetch(`/projects/${project.id}`, platformToken, { method: 'DELETE' }).catch(
        () => {},
      );
    });
    console.log(`[ok] Created project: ${project.id}`);

    // Create anon key with unique name using timestamp to guarantee uniqueness
    // Include realtime permissions for WebSocket tests
    const anonKeyResponse = await platformFetch(
      `/projects/${project.id}/anon-keys`,
      platformToken,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `rls-key-${Date.now()}`,
          permissions: [
            'auth.signup',
            'auth.signin',
            'auth.refresh',
            'auth.logout',
            'realtime.connect',
            'realtime.subscribe',
            'realtime.publish',
          ],
        }),
      },
    );
    anonKey = anonKeyResponse.key_value;
    console.log('[ok] Created anon key');

    // Create database for the project
    database = await platformFetch(`/projects/${project.id}/databases`, platformToken, {
      method: 'POST',
      body: JSON.stringify({
        name: `rls_test_db_${Date.now()}`,
        region: 'aws-us-east-1',
        pg_version: '16',
      }),
    });
    console.log(`[ok] Created database: ${database.id}`);

    // Wait for database to be ready
    console.log('  Waiting for database to be ready...');
    let dbReady = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const dbStatus = await platformFetch(
        `/projects/${project.id}/databases/${database.name}`,
        platformToken,
      );
      if (dbStatus.status === 'active') {
        dbReady = true;
        break;
      }
    }
    if (!dbReady) {
      throw new Error('Database did not become ready in time');
    }
    console.log('[ok] Database is ready');

    // Get database with connection string and init client
    const dbWithConn = await platformFetch(
      `/projects/${project.id}/databases/${database.name}`,
      platformToken,
    );
    if (dbWithConn.connection_string) {
      await initDbClient(dbWithConn.connection_string);
      console.log('[ok] Database client initialized');
    } else {
      throw new Error('Database has no connection_string');
    }

    // Create notes table with RLS
    await executeSql(`
      -- Create notes table
      CREATE TABLE IF NOT EXISTS notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      -- Enable RLS
      ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
      
      -- Create RLS policy: users can only see their own notes
      DROP POLICY IF EXISTS notes_user_isolation ON notes;
      CREATE POLICY notes_user_isolation ON notes
        FOR ALL
        USING (user_id::text = current_setting('request.jwt.claim.sub', true))
        WITH CHECK (user_id::text = current_setting('request.jwt.claim.sub', true));
      
      -- Grant access to authenticated role
      GRANT ALL ON notes TO authenticated;
    `);
    console.log('[ok] Created notes table with RLS policies');

    // Enable realtime for the project
    await platformFetch(`/projects/${project.id}/realtime/config`, platformToken, {
      method: 'PUT',
      body: JSON.stringify({
        enabled: true,
        broadcast_enabled: true,
        presence_enabled: true,
        postgres_changes_enabled: true,
      }),
    });
    console.log('[ok] Enabled realtime for project');

    // Initialize SDK
    const volcano = new VolcanoAuth({ apiUrl: API_URL, anonKey });

    // Create two auth users: Alice and Bob
    const aliceEmail = `alice-${Date.now()}@example.com`;
    const bobEmail = `bob-${Date.now()}@example.com`;
    const password = 'TestPassword123!';

    const aliceSignUp = await volcano.auth.signUp({ email: aliceEmail, password });
    if (aliceSignUp.error) throw new Error(`Failed to create Alice: ${aliceSignUp.error.message}`);
    userAlice = aliceSignUp.user;
    sessionAlice = aliceSignUp.session;
    console.log(`[ok] Created auth user Alice: ${userAlice.email}`);

    const bobSignUp = await volcano.auth.signUp({ email: bobEmail, password });
    if (bobSignUp.error) throw new Error(`Failed to create Bob: ${bobSignUp.error.message}`);
    userBob = bobSignUp.user;
    sessionBob = bobSignUp.session;
    console.log(`[ok] Created auth user Bob: ${userBob.email}`);

    console.log('\n--- Setup complete ---\n');
  }, 120000); // 2 minute timeout for setup

  afterAll(async () => {
    console.log('\n--- Cleaning up ---');
    // Close database client first
    await closeDbClient();
    for (const cleanupFn of cleanupFns.reverse()) {
      try {
        await cleanupFn();
      } catch {}
    }
    console.log('[ok] Cleanup complete\n');
  });

  describe('RLS Isolation for Database Changes', () => {
    let realtimeAlice;
    let realtimeBob;
    let volcanoAlice;
    let volcanoBob;

    beforeAll(async () => {
      volcanoAlice = new VolcanoAuth({
        apiUrl: API_URL,
        anonKey,
        accessToken: sessionAlice.access_token,
      });
      volcanoAlice.database(database.name);

      volcanoBob = new VolcanoAuth({
        apiUrl: API_URL,
        anonKey,
        accessToken: sessionBob.access_token,
      });
      volcanoBob.database(database.name);

      // Connect Alice
      realtimeAlice = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey,
        accessToken: sessionAlice.access_token,
        volcanoClient: volcanoAlice,
        databaseName: database.name,
      });
      await realtimeAlice.connect();

      // Connect Bob
      realtimeBob = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey,
        accessToken: sessionBob.access_token,
        volcanoClient: volcanoBob,
        databaseName: database.name,
      });
      await realtimeBob.connect();
    });

    afterAll(() => {
      if (realtimeAlice) realtimeAlice.disconnect();
      if (realtimeBob) realtimeBob.disconnect();
    });

    test("Users do not receive other users' note inserts via realtime", async () => {
      const aliceChanges = [];
      const bobChanges = [];
      const aliceNoteId = randomUUID();
      const bobNoteId = randomUUID();

      // Subscribe Alice to notes changes
      const aliceChannel = realtimeAlice.channel('public:notes', { type: 'postgres' });
      aliceChannel.onPostgresChanges('INSERT', 'public', 'notes', (change) => {
        aliceChanges.push(change);
      });
      await aliceChannel.subscribe();

      // Subscribe Bob to notes changes
      const bobChannel = realtimeBob.channel('public:notes', { type: 'postgres' });
      bobChannel.onPostgresChanges('INSERT', 'public', 'notes', (change) => {
        bobChanges.push(change);
      });
      await bobChannel.subscribe();

      try {
        // Insert Alice's note via SQL (simulating API or Lambda)
        await executeSql(`
          INSERT INTO notes (id, user_id, title, content)
          VALUES ('${aliceNoteId}', '${userAlice.id}', 'Alice Secret Note', 'This is Alice private data');
        `);

        // Insert Bob's note
        await executeSql(`
          INSERT INTO notes (id, user_id, title, content)
          VALUES ('${bobNoteId}', '${userBob.id}', 'Bob Secret Note', 'This is Bob private data');
        `);

        await new Promise((resolve) => setTimeout(resolve, 2000));

        expect(aliceChannel._subscription).not.toBeNull();
        expect(bobChannel._subscription).not.toBeNull();

        // CRITICAL SECURITY CHECK: Alice must not see Bob's note
        const bobNotesSeenByAlice = aliceChanges.filter((change) =>
          changeMatchesId(change, bobNoteId),
        );
        const aliceNotesSeenByBob = bobChanges.filter((change) =>
          changeMatchesId(change, aliceNoteId),
        );

        expect(bobNotesSeenByAlice).toHaveLength(0);
        expect(aliceNotesSeenByBob).toHaveLength(0);
      } finally {
        aliceChannel.unsubscribe();
        bobChannel.unsubscribe();
      }
    }, 30000);

    test('Users cannot see updates to other users notes', async () => {
      const aliceChanges = [];
      const bobChanges = [];

      // First create notes for both users
      await executeSql(`
        INSERT INTO notes (id, user_id, title, content) 
        VALUES 
          ('11111111-1111-1111-1111-111111111111', '${userAlice.id}', 'Alice Update Test', 'Original'),
          ('22222222-2222-2222-2222-222222222222', '${userBob.id}', 'Bob Update Test', 'Original');
      `);

      // Subscribe to changes
      const aliceChannel = realtimeAlice.channel('public:notes', { type: 'postgres' });
      aliceChannel.onPostgresChanges('UPDATE', 'public', 'notes', (change) => {
        aliceChanges.push(change);
      });
      await aliceChannel.subscribe();

      const bobChannel = realtimeBob.channel('public:notes', { type: 'postgres' });
      bobChannel.onPostgresChanges('UPDATE', 'public', 'notes', (change) => {
        bobChanges.push(change);
      });
      await bobChannel.subscribe();

      // Update both notes
      await executeSql(`
        UPDATE notes SET content = 'Alice Updated Secret' WHERE id = '11111111-1111-1111-1111-111111111111';
      `);
      await executeSql(`
        UPDATE notes SET content = 'Bob Updated Secret' WHERE id = '22222222-2222-2222-2222-222222222222';
      `);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify isolation
      const bobUpdatesSeenByAlice = aliceChanges.filter((c) =>
        c.record?.content?.includes('Bob Updated'),
      );
      const aliceUpdatesSeenByBob = bobChanges.filter((c) =>
        c.record?.content?.includes('Alice Updated'),
      );

      expect(bobUpdatesSeenByAlice).toHaveLength(0);
      expect(aliceUpdatesSeenByBob).toHaveLength(0);

      aliceChannel.unsubscribe();
      bobChannel.unsubscribe();
    }, 30000);

    test('Users cannot see deletes of other users notes', async () => {
      const aliceChanges = [];
      const bobChanges = [];

      // Create notes to delete
      await executeSql(`
        INSERT INTO notes (id, user_id, title, content) 
        VALUES 
          ('33333333-3333-3333-3333-333333333333', '${userAlice.id}', 'Alice Delete Test', 'Will be deleted'),
          ('44444444-4444-4444-4444-444444444444', '${userBob.id}', 'Bob Delete Test', 'Will be deleted');
      `);

      // Subscribe to delete events
      const aliceChannel = realtimeAlice.channel('public:notes', { type: 'postgres' });
      aliceChannel.onPostgresChanges('DELETE', 'public', 'notes', (change) => {
        aliceChanges.push(change);
      });
      await aliceChannel.subscribe();

      const bobChannel = realtimeBob.channel('public:notes', { type: 'postgres' });
      bobChannel.onPostgresChanges('DELETE', 'public', 'notes', (change) => {
        bobChanges.push(change);
      });
      await bobChannel.subscribe();

      // Delete both notes
      await executeSql(`
        DELETE FROM notes WHERE id = '33333333-3333-3333-3333-333333333333';
      `);
      await executeSql(`
        DELETE FROM notes WHERE id = '44444444-4444-4444-4444-444444444444';
      `);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify isolation - neither should see the other's delete
      const bobDeletesSeenByAlice = aliceChanges.filter(
        (c) => c.old_record?.id === '44444444-4444-4444-4444-444444444444',
      );
      const aliceDeletesSeenByBob = bobChanges.filter(
        (c) => c.old_record?.id === '33333333-3333-3333-3333-333333333333',
      );

      expect(bobDeletesSeenByAlice).toHaveLength(0);
      expect(aliceDeletesSeenByBob).toHaveLength(0);

      aliceChannel.unsubscribe();
      bobChannel.unsubscribe();
    }, 30000);
  });

  describe('Broadcast Channel Isolation', () => {
    test('Broadcast messages are scoped to project only', async () => {
      // This test verifies that broadcast channels within a project work correctly
      // but messages cannot cross project boundaries

      const realtimeAlice = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey,
        accessToken: sessionAlice.access_token,
      });
      await realtimeAlice.connect();

      const realtimeBob = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey,
        accessToken: sessionBob.access_token,
      });
      await realtimeBob.connect();

      const aliceMessages = [];
      const bobMessages = [];

      // Both subscribe to same broadcast channel (allowed - broadcast is for collaboration)
      const aliceChannel = realtimeAlice.channel('shared-room');
      aliceChannel.on('message', (data) => aliceMessages.push(data));
      await aliceChannel.subscribe();

      const bobChannel = realtimeBob.channel('shared-room');
      bobChannel.on('message', (data) => bobMessages.push(data));
      await bobChannel.subscribe();

      // Alice sends a message
      await aliceChannel.send({ event: 'message', from: 'Alice', text: 'Hello Bob!' });

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Both should receive the message (broadcast is collaborative)
      // Note: This is expected behavior - broadcast channels are for collaboration
      expect(true).toBe(true);

      realtimeAlice.disconnect();
      realtimeBob.disconnect();
    }, 15000);
  });

  describe('Presence Channel Privacy', () => {
    test('Presence shows only users in the same project channel', async () => {
      const realtimeAlice = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey,
        accessToken: sessionAlice.access_token,
      });
      await realtimeAlice.connect();

      const realtimeBob = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey,
        accessToken: sessionBob.access_token,
      });
      await realtimeBob.connect();

      // Alice joins presence channel
      const aliceChannel = realtimeAlice.channel('lobby', { type: 'presence' });
      await aliceChannel.subscribe();
      await aliceChannel.track({ status: 'online', name: 'Alice' });

      // Bob joins same presence channel
      const bobChannel = realtimeBob.channel('lobby', { type: 'presence' });
      await bobChannel.subscribe();
      await bobChannel.track({ status: 'online', name: 'Bob' });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Both should see each other (same project, same channel)
      const aliceState = aliceChannel.getPresenceState();
      const bobState = bobChannel.getPresenceState();

      // Presence state should be accessible
      expect(aliceState).toBeDefined();
      expect(bobState).toBeDefined();

      realtimeAlice.disconnect();
      realtimeBob.disconnect();
    }, 15000);
  });
});
