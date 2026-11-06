/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://abcd.supabase.co. Leave unset for an offline-only build. */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase publishable (anon) key. Public by design; row-level security protects the data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Link shown under About, e.g. https://github.com/owner/repo */
  readonly VITE_REPO_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __APP_VERSION__: string
