import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { integrations } from "@/lib/config";

let _client: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service-role key (bypasses RLS).
 * Server-only — never import into a client component. All hub reads/writes in
 * live mode go through this.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!integrations.supabase) throw new Error("Supabase is not configured");
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _client;
}
