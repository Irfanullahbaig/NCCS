function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

export function getSupabaseUrl() {
  return firstEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
}

export function getSupabasePublishableKey() {
  return firstEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
  );
}

export function getSupabaseSecretKey() {
  return firstEnv("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
}

export function requireSupabaseUrl() {
  const value = getSupabaseUrl();
  if (!value) throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is not set");
  return value;
}

export function requireSupabasePublishableKey() {
  const value = getSupabasePublishableKey();
  if (!value) throw new Error("SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set");
  return value;
}
