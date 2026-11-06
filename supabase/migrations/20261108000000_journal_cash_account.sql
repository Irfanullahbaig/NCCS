-- Adds the Cash Account to the accounting journal.
-- Cash payments now debit (or, for expenses, credit) CASH; every other payment
-- method uses BANK. Entries already posted to BANK for cash payments are not
-- edited: the app posts a reversing entry on BANK and a new entry on CASH, so
-- the history of every change stays in the journal.
-- Run after 20261106000000_journal_entries.sql.

alter table public."JournalEntry" drop constraint if exists "JournalEntry_debitAccount_check";
alter table public."JournalEntry" drop constraint if exists "JournalEntry_creditAccount_check";

alter table public."JournalEntry"
  add constraint "JournalEntry_debitAccount_check"
  check ("debitAccount" in ('BANK', 'CASH', 'ACCOUNTS_RECEIVABLE', 'FEE_INCOME', 'OTHER_INCOME', 'EXPENSES'));

alter table public."JournalEntry"
  add constraint "JournalEntry_creditAccount_check"
  check ("creditAccount" in ('BANK', 'CASH', 'ACCOUNTS_RECEIVABLE', 'FEE_INCOME', 'OTHER_INCOME', 'EXPENSES'));

notify pgrst, 'reload schema';
