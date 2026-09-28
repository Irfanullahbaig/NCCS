function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value && value !== "[SENSITIVE]") return value;
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
  if (!value) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
  return value;
}

export function requireSupabasePublishableKey() {
  const value = getSupabasePublishableKey();
  if (!value) throw new Error("Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY");
  return value;
}

export function requireSupabaseSecretKey() {
  const value = getSupabaseSecretKey();
  if (!value) throw new Error("Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  return value;
}
