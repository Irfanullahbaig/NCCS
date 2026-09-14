import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`${names[0]} is not set`);
}

export function createSupabaseAdminClient(): SupabaseClient {
  return createClient(firstEnv("SUPABASE_URL"), firstEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createSupabaseAnonClient(): SupabaseClient {
  return createClient(firstEnv("SUPABASE_URL"), firstEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
