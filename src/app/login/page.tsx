import { SCHOOL_FULL_NAME } from "@/lib/constants";
import { getSupabaseSecretKey, getSupabaseUrl } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

function isDatabaseConfigured() {
  if (process.env.NCCS_USE_DUMMY_DATA === "1") return true;
  return Boolean(getSupabaseUrl() && getSupabaseSecretKey());
}

function LoginLogo({
  align = "start",
  size = "md",
}: {
  align?: "start" | "center";
  size?: "md" | "lg";
}) {
  return (
    <div className={["relative z-10", align === "center" ? "flex justify-center" : ""].join(" ")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/nccs-logo-mark.png"
        alt="NCCS"
        width={180}
        height={88}
        className={[
          "h-10 w-auto max-w-full object-contain sm:h-11",
          size === "lg" ? "lg:h-12" : "",
        ].join(" ")}
      />
    </div>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const databaseConfigured = isDatabaseConfigured();
  return (
    <div className="grid min-h-screen min-w-0 lg:grid-cols-2">
      <section className="relative hidden min-w-0 overflow-hidden bg-navy p-8 text-white sm:p-10 lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(20,184,166,0.25),_transparent_45%)]" />
        <LoginLogo size="lg" />
        <div className="relative my-auto max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight">School & College Management Dashboard</h1>
          <p className="mt-4 text-white/70">
            Manage students, staff, classes, and finances from one source of truth. Fee payments automatically update student records, class dashboards, and financial reports.
          </p>
        </div>
        <p className="relative text-sm text-white/50">{SCHOOL_FULL_NAME}</p>
      </section>
      <section className="flex min-w-0 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden">
            <LoginLogo align="center" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal">Welcome back</p>
          <h2 className="mt-2 text-3xl font-semibold text-navy">Sign in</h2>
          <p className="mt-2 text-sm text-slate-500">Use your assigned role to access the modules you are permitted to manage.</p>
          {params.error === "invalid" ? (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">Invalid email or password.</p>
          ) : null}
          {!databaseConfigured ? (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Database is not configured. In <code className="font-medium">.env.local</code> (and Vercel), set{" "}
              <code className="font-medium">NEXT_PUBLIC_SUPABASE_URL</code> to{" "}
              <code className="font-medium">https://YOUR_PROJECT_REF.supabase.co</code> and{" "}
              <code className="font-medium">SUPABASE_SECRET_KEY</code> to the secret / service_role key from Project
              Settings → API Keys. Do not use a <code className="font-medium">postgresql://</code> connection string.
              Restart the app after saving.
            </p>
          ) : null}
          {databaseConfigured && params.error === "server" ? (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Could not reach Supabase. Confirm the URL and secret key belong to the new project, the NCCS schema SQL
              has been run, then restart or redeploy.
            </p>
          ) : null}
          <form action="/api/auth/login" method="post" className="mt-8 space-y-4">
            <input type="hidden" name="next" value={params.next ?? "/"} />
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
              <input name="email" type="email" required autoComplete="username" className="h-11 w-full rounded-xl border border-slate-200 px-3" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</label>
              <input name="password" type="password" required autoComplete="current-password" className="h-11 w-full rounded-xl border border-slate-200 px-3" />
            </div>
            <button className="h-11 w-full rounded-xl bg-teal font-medium text-white hover:bg-teal-500">Sign in</button>
          </form>
        </div>
      </section>
    </div>
  );
}
