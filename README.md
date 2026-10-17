# NCCS School Management Dashboard

Modern school/college management system for students, staff, classes, and finances.

Fee status is never typed in by hand. It is calculated from expected amount, payments, and waivers, so student records, class dashboards, and finance reports stay consistent.

## New Supabase database

This app talks to hosted Supabase Postgres through the Data API (service role). Login uses the NCCS JWT cookie, not Supabase Auth.

1. Create a **new** Supabase project (empty database).
2. In the SQL Editor, run `supabase/migrations/20260928212038_nccs_schema.sql`, **or** from this repo:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

3. Copy `.env.example` to `.env.local` and fill in keys from **Project Settings → API Keys**.
4. On Vercel, set the same variables (Production, and Preview if you use it):

| Variable | Vercel type | Where to copy it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Config | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Config | Publishable / anon key |
| `SUPABASE_SECRET_KEY` | Secret | Secret / service_role key |
| `AUTH_SECRET` | Secret | Long random string you generate |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Secret | Long random string you generate |

Do not put the secret key in any `NEXT_PUBLIC_` variable.

5. Create the first admin once:

```bash
NCCS_ALLOW_SEED=1 npm run db:seed
```

Then change those passwords from **Users**. Redeploy on Vercel after the env vars are saved.

## Local web app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Windows / macOS desktop app

The packaged desktop app stores data on this computer (`NCCS.exe` / `NCCS.dmg`) and does not use the hosted database.

```bash
npm install
npm run desktop:win
npm run desktop:mac
```

On first launch, enter the Administrator License Key, then create an administrator account. The key is stored on this computer and is not asked again until the app is installed on another machine.

## Critical workflow

1. Create a class such as **Grade 10 — ICS**.
2. Add a student and assign the class fee.
3. Record a payment (or add student-fee income).
4. The system writes the payment, creates the income transaction, recalculates fee status, and updates the class and finance dashboards from the same records.
