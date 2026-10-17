alter table public."FeeRecord"
  add column if not exists "fineAmount" numeric(12, 2) not null default 0;

comment on column public."FeeRecord"."fineAmount" is
  'Late fee of 200 PKR applied after the 10th of the fee month when tuition was unpaid.';
