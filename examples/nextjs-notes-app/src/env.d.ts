// The NEXT_PUBLIC_* variables src/lib/volcano.ts reads. Next.js inlines them at build time.
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_VOLCANO_API_URL?: string;
    readonly NEXT_PUBLIC_VOLCANO_ANON_KEY?: string;
    readonly NEXT_PUBLIC_VOLCANO_DATABASE_NAME?: string;
  }
}
