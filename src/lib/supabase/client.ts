import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { requireSupabasePublishableKey, requireSupabaseUrl } from "@/lib/supabase/env";

export function createClient() {
  return createBrowserClient<Database>(requireSupabaseUrl(), requireSupabasePublishableKey());
}
