import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { requireSupabaseSecretKey, requireSupabaseUrl } from "@/lib/supabase/env";

export type AdminClient = SupabaseClient<Database>;

export function createAdminClient(): AdminClient {
  return createClient<Database>(requireSupabaseUrl(), requireSupabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Accept: "application/json" } },
  });
}
