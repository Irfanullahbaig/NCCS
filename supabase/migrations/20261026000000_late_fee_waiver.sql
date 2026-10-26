alter table public."FeeRecord"
  add column if not exists "fineWaived" boolean not null default false,
  add column if not exists "fineWaivedAt" timestamptz,
  add column if not exists "fineWaivedById" uuid,
  add column if not exists "fineWaiveReason" text;

comment on column public."FeeRecord"."fineWaived" is
  'When true the late fee is never charged for this fee month, even if it was paid late.';

create index if not exists "FeeRecord_fineAmount_positive_idx" on public."FeeRecord" ("fineAmount") where "fineAmount" > 0;
