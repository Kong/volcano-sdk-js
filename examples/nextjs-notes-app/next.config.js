/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Runtime config allows reading env vars at runtime (not just build time)
  // This enables passing env vars via command line: NEXT_PUBLIC_VOLCANO_ANON_KEY=... pnpm dev
  publicRuntimeConfig: {
    volcanoApiUrl: process.env.NEXT_PUBLIC_VOLCANO_API_URL,
    volcanoAnonKey: process.env.NEXT_PUBLIC_VOLCANO_ANON_KEY,
    volcanoDatabaseName: process.env.NEXT_PUBLIC_VOLCANO_DATABASE_NAME,
  },
};

module.exports = nextConfig;
