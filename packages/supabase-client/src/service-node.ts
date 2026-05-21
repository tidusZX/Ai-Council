import { createClient } from '@supabase/supabase-js'
import type { Database } from '@shaq-os/database-types'

/**
 * Service-role Supabase client for plain Node services (no Next.js).
 *
 * Bypasses RLS — only use server-side, never in a browser context.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from env.
 * Disables auth session persistence (services don't have a user session).
 */
export function createServiceNodeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'createServiceNodeClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
    )
  }

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
