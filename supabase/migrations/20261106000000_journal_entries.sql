-- Double-entry accounting journal.
-- Every row is one balanced posting: the same amount is debited to one account
-- and credited to another, so total debits always equal total credits.
-- Rows are append-only: a change to a fee or payment posts a new adjusting row
-- rather than editing an old one, which keeps a complete audit trail.

create table if not exists public."JournalEntry" (
  id uuid primary key,
  "entryNo" bigint generated always as identity,
  date date not null,
  kind text not null check (kind in ('FEE_CHARGE', 'FEE_PAYMENT', 'INCOME', 'EXPENSE')),
  "sourceType" text not null check ("sourceType" in ('FeeRecord', 'FeePayment', 'IncomeTransaction', 'ExpenseTransaction')),
  "sourceId" uuid not null,
  -- 1 for the first posting of a source, then 2, 3 … for each adjustment.
  revision integer not null check (revision > 0),
  "debitAccount" text not null check ("debitAccount" in ('BANK', 'ACCOUNTS_RECEIVABLE', 'FEE_INCOME', 'OTHER_INCOME', 'EXPENSES')),
  "creditAccount" text not null check ("creditAccount" in ('BANK', 'ACCOUNTS_RECEIVABLE', 'FEE_INCOME', 'OTHER_INCOME', 'EXPENSES')),
  amount numeric(14, 2) not null check (amount > 0),
  "studentId" uuid,
  memo text not null,
  "createdAt" timestamptz not null default now(),
  "createdById" uuid,
  constraint "JournalEntry_accounts_differ" check ("debitAccount" <> "creditAccount"),
  -- Two requests can never post the same adjustment twice.
  constraint "JournalEntry_source_revision_key" unique ("sourceType", "sourceId", revision),
  constraint "JournalEntry_studentId_fkey"
    foreign key ("studentId") references public."Student"(id) on delete set null,
  constraint "JournalEntry_createdById_fkey"
    foreign key ("createdById") references public."User"(id) on delete set null
);

create index if not exists "JournalEntry_date_idx" on public."JournalEntry" (date desc);
create index if not exists "JournalEntry_studentId_idx" on public."JournalEntry" ("studentId");
create index if not exists "JournalEntry_debitAccount_idx" on public."JournalEntry" ("debitAccount");
create index if not exists "JournalEntry_creditAccount_idx" on public."JournalEntry" ("creditAccount");

-- Journal rows are never edited or deleted; corrections are new rows.
-- The only change allowed is clearing a link to a student or user who was removed.
create or replace function public."JournalEntry_block_changes"() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and (new.id, new."entryNo", new.date, new.kind, new."sourceType", new."sourceId", new.revision,
          new."debitAccount", new."creditAccount", new.amount, new.memo, new."createdAt")
         is not distinct from
         (old.id, old."entryNo", old.date, old.kind, old."sourceType", old."sourceId", old.revision,
          old."debitAccount", old."creditAccount", old.amount, old.memo, old."createdAt") then
    return new;
  end if;
  raise exception 'Journal entries cannot be changed or deleted. Post an adjusting entry instead.';
end;
$$;

drop trigger if exists "JournalEntry_no_update" on public."JournalEntry";
create trigger "JournalEntry_no_update"
  before update or delete on public."JournalEntry"
  for each row execute function public."JournalEntry_block_changes"();

alter table public."JournalEntry" enable row level security;
revoke all on table public."JournalEntry" from anon, authenticated, public;
grant select, insert, update on table public."JournalEntry" to service_role;

notify pgrst, 'reload schema';

-- Balances for the dashboard, added up in the database rather than row by row in the app.
create or replace function public.journal_account_totals()
returns table (account text, debit numeric, credit numeric, entries bigint)
language sql stable as $$
  select account, sum(debit), sum(credit), sum(entries)::bigint
  from (
    select "debitAccount" as account, sum(amount) as debit, 0::numeric as credit, count(*) as entries
    from public."JournalEntry" group by "debitAccount"
    union all
    select "creditAccount", 0::numeric, sum(amount), 0
    from public."JournalEntry" group by "creditAccount"
  ) sides
  group by account;
$$;

create or replace function public.journal_student_receivables()
returns table ("studentId" uuid, balance numeric)
language sql stable as $$
  select "studentId",
         sum(case when "debitAccount" = 'ACCOUNTS_RECEIVABLE' then amount else -amount end)
  from public."JournalEntry"
  where "studentId" is not null
    and 'ACCOUNTS_RECEIVABLE' in ("debitAccount", "creditAccount")
  group by "studentId";
$$;

-- Month-by-month movements for the dashboard's financial overview.
create or replace function public.journal_monthly_totals()
returns table (month text, kind text, "debitAccount" text, "creditAccount" text, amount numeric, entries bigint)
language sql stable as $$
  select to_char(j.date, 'YYYY-MM'), j.kind, j."debitAccount", j."creditAccount", sum(j.amount), count(*)
  from public."JournalEntry" j
  group by 1, 2, 3, 4;
$$;

revoke all on function public.journal_account_totals() from anon, authenticated, public;
revoke all on function public.journal_student_receivables() from anon, authenticated, public;
revoke all on function public.journal_monthly_totals() from anon, authenticated, public;
grant execute on function public.journal_account_totals() to service_role;
grant execute on function public.journal_student_receivables() to service_role;
grant execute on function public.journal_monthly_totals() to service_role;

notify pgrst, 'reload schema';
