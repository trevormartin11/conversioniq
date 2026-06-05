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

/** Upsert rows in chunks (Supabase caps payload size). Returns rows written. */
export async function chunkedUpsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict = "id",
  chunk = 500,
): Promise<number> {
  const db = supabaseAdmin();
  let count = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await db.from(table).upsert(slice, { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    count += slice.length;
  }
  return count;
}
