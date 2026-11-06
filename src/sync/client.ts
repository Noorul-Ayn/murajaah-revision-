import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase is optional. Without VITE_SUPABASE_URL and
 * VITE_SUPABASE_PUBLISHABLE_KEY the app runs fully offline and hides sign-in.
 * The publishable (anon) key is meant to be public; row-level security on the
 * server is what keeps each user's data private (see supabase/migrations).
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const syncConfigured = Boolean(url && key)

/** Where a sign-in link should return to: this app, at its own path. */
export function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`
}

/** A sign-in link's result in the address bar, if the page was opened from one. */
export function readAuthRedirect(): { hasCode: boolean; error: string | null } {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#\/?/, '').split('?').pop() ?? '')
  return {
    hasCode: search.has('code'),
    error: search.get('error_description') ?? hash.get('error_description'),
  }
}

/**
 * Removes ?code=… and error details from the address bar and opens Settings,
 * where the account section shows whether signing in worked.
 */
export function clearAuthRedirect(): void {
  window.history.replaceState(null, '', `${window.location.pathname}#/settings`)
  // Let the router see the new route.
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Sign-in links come back as ?code=…, exchanged using a verifier kept
          // in this browser (PKCE). Codes typed from the email work too.
          flowType: 'pkce',
          detectSessionInUrl: true,
        },
      })
    : null
