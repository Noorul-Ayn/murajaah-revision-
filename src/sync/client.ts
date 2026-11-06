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

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null
