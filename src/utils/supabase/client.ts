import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublishableKey, requireSupabaseUrl } from "@/utils/supabase/env";

export function createClient() {
  return createBrowserClient(requireSupabaseUrl(), requireSupabasePublishableKey());
}
