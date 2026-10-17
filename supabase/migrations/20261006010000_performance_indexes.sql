create index if not exists "User_email_idx" on public."User" (email);
create index if not exists "FeePayment_paymentDate_idx" on public."FeePayment" ("paymentDate");
create index if not exists "SalaryPayment_paymentDate_idx" on public."SalaryPayment" ("paymentDate");
create index if not exists "Student_status_active_idx" on public."Student" (status) where "deletedAt" is null;
create index if not exists "FeeRecord_fineAmount_idx" on public."FeeRecord" ("fineAmount") where "fineAmount" = 0;
