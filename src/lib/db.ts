import type { PostgrestError } from "@supabase/supabase-js";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { createDummyClient, isDummyDataEnabled } from "@/lib/supabase/dummy";

const globalForDb = globalThis as unknown as { nccsAdmin?: AdminClient; nccsDummy?: AdminClient };

/** Hosted app uses the Supabase service-role client. Dummy JSON is desktop-only. */
export function db() {
  if (isDummyDataEnabled()) {
    if (!globalForDb.nccsDummy) {
      globalForDb.nccsDummy = createDummyClient();
    }
    return globalForDb.nccsDummy;
  }
  if (!globalForDb.nccsAdmin) {
    globalForDb.nccsAdmin = createAdminClient();
  }
  return globalForDb.nccsAdmin;
}

export function newId() {
  return crypto.randomUUID();
}

export function nowIso(value: Date | string = new Date()) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function throwIfError<T>(result: { data: T; error: PostgrestError | null }): T {
  if (result.error) throw result.error;
  return result.data;
}
