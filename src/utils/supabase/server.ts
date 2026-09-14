import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabasePublishableKey, requireSupabaseUrl } from "@/utils/supabase/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(requireSupabaseUrl(), requireSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component. Proxy refreshes the session.
        }
      },
    },
  });
}
