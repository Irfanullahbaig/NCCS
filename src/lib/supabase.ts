import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey, requireSupabasePublishableKey, requireSupabaseUrl } from "@/utils/supabase/env";

export function createSupabaseAdminClient(): SupabaseClient {
  const secret = getSupabaseSecretKey();
  if (!secret) throw new Error("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(requireSupabaseUrl(), secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createSupabaseAnonClient(): SupabaseClient {
  return createClient(requireSupabaseUrl(), requireSupabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
