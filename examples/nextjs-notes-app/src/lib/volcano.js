/**
 * Volcano SDK Initialization
 *
 * This file creates and exports a singleton instance of the Volcano SDK.
 * Import `volcano` from this file throughout your application.
 *
 * @example
 * import { database, volcano } from '@/lib/volcano';
 *
 * // Authentication
 * await volcano.auth.signIn({ email, password });
 *
 * // Database queries
 * const { data } = await database.from('notes').select('*');
 */

import { createVolcanoClient } from '@volcano.dev/sdk';
import getConfig from 'next/config';

// ---------------------------------------------------------------------------
// SDK CONFIGURATION
// ---------------------------------------------------------------------------

/**
 * Get configuration from either runtime config (command line) or env vars (.env.local)
 * Runtime config takes precedence for command-line usage
 */
function getVolcanoConfig() {
  // Try runtime config first (supports command-line env vars)
  const { publicRuntimeConfig } = getConfig() || {};

  return {
    baseUrl: publicRuntimeConfig?.volcanoApiUrl || process.env.NEXT_PUBLIC_VOLCANO_API_URL,
    anonKey: publicRuntimeConfig?.volcanoAnonKey || process.env.NEXT_PUBLIC_VOLCANO_ANON_KEY,
    databaseName:
      publicRuntimeConfig?.volcanoDatabaseName || process.env.NEXT_PUBLIC_VOLCANO_DATABASE_NAME,
  };
}

const config = getVolcanoConfig();

/**
 * Validate required configuration
 * This warns about missing configuration but doesn't crash the app
 */
function validateConfig() {
  const missing = [];
  if (!config.anonKey) {
    missing.push('NEXT_PUBLIC_VOLCANO_ANON_KEY');
  }
  if (!config.databaseName) {
    missing.push('NEXT_PUBLIC_VOLCANO_DATABASE_NAME');
  }

  if (missing.length > 0 && typeof window !== 'undefined') {
    console.warn(
      `⚠️ Missing configuration: ${missing.join(', ')}\n\n` +
        'Either create a .env.local file or pass via command line:\n' +
        'NEXT_PUBLIC_VOLCANO_ANON_KEY=... NEXT_PUBLIC_VOLCANO_DATABASE_NAME=... pnpm dev',
    );
  }
}

// Validate on module load
validateConfig();

// ---------------------------------------------------------------------------
// SDK INSTANCE
// ---------------------------------------------------------------------------

/**
 * The Volcano SDK client instance.
 *
 * Features:
 * - Authentication (signUp, signIn, signOut, etc.)
 * - Database queries (from, insert, update, delete)
 * - Session persistence (automatic localStorage in browser)
 * - Token refresh (automatic when tokens expire)
 *
 * @type {ReturnType<typeof createVolcanoClient>}
 */
export const volcano = createVolcanoClient({
  // Volcano API endpoint (optional - defaults to https://api.volcano.dev)
  ...(config.baseUrl && { baseUrl: config.baseUrl }),

  // Anonymous key - safe for frontend, identifies your project
  anonKey: config.anonKey || '',
});

export const database = volcano.database(config.databaseName || '');

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

// Default export for convenience
export default volcano;
