-- NCCS schema for a new empty Supabase project.
-- Quoted PascalCase names match the existing PostgREST client (`db().from("Student")`).
-- The Next.js app uses the service role and a custom JWT cookie, not Supabase Auth.
-- Apply on a new project only: Dashboard SQL editor, or `supabase link` then `supabase db push`.

create type public."ClassStatus" as enum ('ACTIVE', 'INACTIVE');
create type public."EmploymentStatus" as enum ('ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED');
create type public."ExpenseCategory" as enum (
  'SALARIES',
  'UTILITIES',
  'RENT',
  'MAINTENANCE',
  'SUPPLIES',
  'TRANSPORT',
  'OTHER_EXPENSES'
);
create type public."FacultyType" as enum ('PERMANENT', 'VISITING');
create type public."FeeStatus" as enum ('PAID', 'PARTIALLY_PAID', 'PENDING', 'OVERDUE', 'WAIVED');
create type public."Gender" as enum ('MALE', 'FEMALE', 'OTHER');
create type public."IncomeCategory" as enum (
  'STUDENT_FEE',
  'ADMISSION_FEE',
  'REGISTRATION_FEE',
  'TRANSPORT_FEE',
  'OTHER_INCOME'
);
create type public."PaymentMethod" as enum ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE', 'OTHER');
create type public."Role" as enum ('ADMIN', 'PRINCIPAL', 'ACCOUNTANT');
create type public."SalaryStatus" as enum ('PAID', 'PARTIALLY_PAID', 'PENDING');
create type public."StudentStatus" as enum ('ACTIVE', 'INACTIVE', 'GRADUATED', 'SUSPENDED');
create type public."StudentType" as enum ('SELF', 'SCHOLARSHIP', 'NEED_BASED');

grant usage on type public."ClassStatus" to service_role;
grant usage on type public."EmploymentStatus" to service_role;
grant usage on type public."ExpenseCategory" to service_role;
grant usage on type public."FacultyType" to service_role;
grant usage on type public."FeeStatus" to service_role;
grant usage on type public."Gender" to service_role;
grant usage on type public."IncomeCategory" to service_role;
grant usage on type public."PaymentMethod" to service_role;
grant usage on type public."Role" to service_role;
grant usage on type public."SalaryStatus" to service_role;
grant usage on type public."StudentStatus" to service_role;
grant usage on type public."StudentType" to service_role;

create table public."User" (
  id uuid primary key,
  name text not null,
  email text not null,
  "passwordHash" text not null,
  role public."Role" not null default 'ADMIN',
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdById" uuid,
  "updatedById" uuid,
  constraint "User_email_key" unique (email)
);

create table public."Setting" (
  id uuid primary key,
  key text not null,
  value text not null,
  constraint "Setting_key_key" unique (key)
);

create table public."Sequence" (
  name text primary key,
  value integer not null
);

create table public."AcademicYear" (
  id uuid primary key,
  name text not null,
  "startDate" date not null,
  "endDate" date not null,
  "isActive" boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdById" uuid,
  "updatedById" uuid
);

create table public."Program" (
  id uuid primary key,
  name text not null,
  description text,
  status text not null default 'ACTIVE',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdById" uuid,
  "updatedById" uuid
);

create table public."Subject" (
  id uuid primary key,
  name text not null,
  code text not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdById" uuid,
  "updatedById" uuid,
  constraint "Subject_code_key" unique (code)
);

create table public."Staff" (
  id uuid primary key,
  "staffId" text not null,
  "firstName" text not null,
  "lastName" text not null,
  gender public."Gender" not null,
  "contactNumber" text not null,
  "emergencyContact" text,
  email text,
  address text not null,
  qualification text not null,
  "dateOfJoining" date not null,
  "employmentStatus" public."EmploymentStatus" not null default 'ACTIVE',
  "facultyType" public."FacultyType" not null default 'PERMANENT',
  "salaryAmount" numeric(12, 2) not null default 0,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdById" uuid,
  "updatedById" uuid,
  constraint "Staff_staffId_key" unique ("staffId")
);

create table public."Class" (
  id uuid primary key,
  name text not null,
  code text not null,
  "programId" uuid not null,
  "academicYearId" uuid not null,
  "classTeacherId" uuid,
  "feeAmount" numeric(12, 2) not null default 0,
  status public."ClassStatus" not null default 'ACTIVE',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdById" uuid,
  "updatedById" uuid,
  constraint "Class_code_key" unique (code),
  constraint "Class_programId_fkey"
    foreign key ("programId") references public."Program"(id) on delete restrict,
  constraint "Class_academicYearId_fkey"
    foreign key ("academicYearId") references public."AcademicYear"(id) on delete restrict,
  constraint "Class_classTeacherId_fkey"
    foreign key ("classTeacherId") references public."Staff"(id) on delete set null
);

create table public."ClassSubject" (
  "classId" uuid not null,
  "subjectId" uuid not null,
  primary key ("classId", "subjectId"),
  constraint "ClassSubject_classId_fkey"
    foreign key ("classId") references public."Class"(id) on delete cascade,
  constraint "ClassSubject_subjectId_fkey"
    foreign key ("subjectId") references public."Subject"(id) on delete cascade
);

create table public."StaffSubject" (
  "staffId" uuid not null,
  "subjectId" uuid not null,
  primary key ("staffId", "subjectId"),
  constraint "StaffSubject_staffId_fkey"
    foreign key ("staffId") references public."Staff"(id) on delete cascade,
  constraint "StaffSubject_subjectId_fkey"
    foreign key ("subjectId") references public."Subject"(id) on delete cascade
);

create table public."StaffAssignment" (
  id uuid primary key,
  "staffId" uuid not null,
  "classId" uuid not null,
  "subjectId" uuid,
  "createdAt" timestamptz not null default now(),
  constraint "StaffAssignment_staffId_fkey"
    foreign key ("staffId") references public."Staff"(id) on delete cascade,
  constraint "StaffAssignment_classId_fkey"
    foreign key ("classId") references public."Class"(id) on delete cascade,
  constraint "StaffAssignment_subjectId_fkey"
    foreign key ("subjectId") references public."Subject"(id) on delete set null
);

create table public."Student" (
  id uuid primary key,
  "registrationNo" text not null,
  "firstName" text not null,
  "lastName" text not null,
  "fatherName" text not null,
  gender public."Gender" not null,
  "contactNumber" text not null,
  email text,
  address text not null,
  "dateOfAdmission" date not null,
  "classId" uuid not null,
  "studentType" public."StudentType" not null,
  "feeAmount" numeric(12, 2) not null default 0,
  status public."StudentStatus" not null default 'ACTIVE',
  "deletedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdById" uuid,
  "updatedById" uuid,
  constraint "Student_registrationNo_key" unique ("registrationNo"),
  constraint "Student_classId_fkey"
    foreign key ("classId") references public."Class"(id) on delete restrict
);

create table public."FeeRecord" (
  id uuid primary key,
  "studentId" uuid not null,
  "classId" uuid not null,
  "academicYearId" uuid not null,
  month integer not null,
  year integer not null,
  "dueDate" date not null,
  "expectedAmount" numeric(12, 2) not null,
  "paidAmount" numeric(12, 2) not null default 0,
  "waivedAmount" numeric(12, 2) not null default 0,
  "remainingAmount" numeric(12, 2) not null,
  status public."FeeStatus" not null default 'PENDING',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdById" uuid,
  "updatedById" uuid,
  constraint "FeeRecord_month_check" check (month between 1 and 12),
  constraint "FeeRecord_studentId_month_year_key" unique ("studentId", month, year),
  constraint "FeeRecord_studentId_fkey"
    foreign key ("studentId") references public."Student"(id) on delete restrict,
  constraint "FeeRecord_classId_fkey"
    foreign key ("classId") references public."Class"(id) on delete restrict,
  constraint "FeeRecord_academicYearId_fkey"
    foreign key ("academicYearId") references public."AcademicYear"(id) on delete restrict
);

create table public."IncomeTransaction" (
  id uuid primary key,
  "incomeId" text not null,
  date date not null,
  category public."IncomeCategory" not null,
  amount numeric(12, 2) not null,
  "paymentMethod" public."PaymentMethod" not null,
  "referenceNumber" text,
  source text,
  notes text,
  "studentId" uuid,
  "classId" uuid,
  "voidedAt" timestamptz,
  "voidedById" uuid,
  "voidReason" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdById" uuid,
  "updatedById" uuid,
  constraint "IncomeTransaction_incomeId_key" unique ("incomeId"),
  constraint "IncomeTransaction_studentId_fkey"
    foreign key ("studentId") references public."Student"(id) on delete set null,
  constraint "IncomeTransaction_classId_fkey"
    foreign key ("classId") references public."Class"(id) on delete set null
);

create table public."ExpenseTransaction" (
  id uuid primary key,
  "expenseId" text not null,
  date date not null,
  category public."ExpenseCategory" not null,
  amount numeric(12, 2) not null,
  "paidTo" text not null,
  description text,
  "paymentMethod" public."PaymentMethod" not null,
  "referenceNumber" text,
  notes text,
  "voidedAt" timestamptz,
  "voidedById" uuid,
  "voidReason" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdById" uuid,
  "updatedById" uuid,
  constraint "ExpenseTransaction_expenseId_key" unique ("expenseId")
);

create table public."FeePayment" (
  id uuid primary key,
  "studentId" uuid not null,
  "feeRecordId" uuid not null,
  "incomeTransactionId" uuid not null,
  amount numeric(12, 2) not null,
  "paymentDate" date not null,
  "paymentMethod" public."PaymentMethod" not null,
  "referenceNumber" text,
  notes text,
  "voidedAt" timestamptz,
  "voidedById" uuid,
  "voidReason" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdById" uuid,
  "updatedById" uuid,
  constraint "FeePayment_incomeTransactionId_key" unique ("incomeTransactionId"),
  constraint "FeePayment_studentId_fkey"
    foreign key ("studentId") references public."Student"(id) on delete restrict,
  constraint "FeePayment_feeRecordId_fkey"
    foreign key ("feeRecordId") references public."FeeRecord"(id) on delete restrict,
  constraint "FeePayment_incomeTransactionId_fkey"
    foreign key ("incomeTransactionId") references public."IncomeTransaction"(id) on delete restrict
);

create table public."SalaryRecord" (
  id uuid primary key,
  "staffId" uuid not null,
  month integer not null,
  year integer not null,
  "expectedAmount" numeric(12, 2) not null,
  "paidAmount" numeric(12, 2) not null default 0,
  "remainingAmount" numeric(12, 2) not null,
  status public."SalaryStatus" not null default 'PENDING',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdById" uuid,
  "updatedById" uuid,
  constraint "SalaryRecord_month_check" check (month between 1 and 12),
  constraint "SalaryRecord_staffId_month_year_key" unique ("staffId", month, year),
  constraint "SalaryRecord_staffId_fkey"
    foreign key ("staffId") references public."Staff"(id) on delete restrict
);

create table public."SalaryPayment" (
  id uuid primary key,
  "staffId" uuid not null,
  "salaryRecordId" uuid not null,
  "expenseTransactionId" uuid not null,
  amount numeric(12, 2) not null,
  "paymentDate" date not null,
  "paymentMethod" public."PaymentMethod" not null,
  "referenceNumber" text,
  notes text,
  "voidedAt" timestamptz,
  "voidedById" uuid,
  "voidReason" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdById" uuid,
  "updatedById" uuid,
  constraint "SalaryPayment_expenseTransactionId_key" unique ("expenseTransactionId"),
  constraint "SalaryPayment_staffId_fkey"
    foreign key ("staffId") references public."Staff"(id) on delete restrict,
  constraint "SalaryPayment_salaryRecordId_fkey"
    foreign key ("salaryRecordId") references public."SalaryRecord"(id) on delete restrict,
  constraint "SalaryPayment_expenseTransactionId_fkey"
    foreign key ("expenseTransactionId") references public."ExpenseTransaction"(id) on delete restrict
);

create table public."AuditLog" (
  id uuid primary key,
  "userId" uuid,
  action text not null,
  "entityType" text not null,
  "entityId" text,
  details text,
  "createdAt" timestamptz not null default now(),
  constraint "AuditLog_userId_fkey"
    foreign key ("userId") references public."User"(id) on delete set null
);

create index "Class_programId_idx" on public."Class" ("programId");
create index "Class_academicYearId_idx" on public."Class" ("academicYearId");
create index "Class_classTeacherId_idx" on public."Class" ("classTeacherId");
create index "ClassSubject_subjectId_idx" on public."ClassSubject" ("subjectId");
create index "StaffSubject_subjectId_idx" on public."StaffSubject" ("subjectId");
create index "StaffAssignment_staffId_idx" on public."StaffAssignment" ("staffId");
create index "StaffAssignment_classId_idx" on public."StaffAssignment" ("classId");
create index "StaffAssignment_subjectId_idx" on public."StaffAssignment" ("subjectId");
create index "Student_classId_idx" on public."Student" ("classId");
create index "Student_deletedAt_idx" on public."Student" ("deletedAt");
create index "FeeRecord_classId_idx" on public."FeeRecord" ("classId");
create index "FeeRecord_academicYearId_idx" on public."FeeRecord" ("academicYearId");
create index "FeeRecord_month_year_idx" on public."FeeRecord" (month, year);
create index "FeeRecord_status_idx" on public."FeeRecord" (status);
create index "IncomeTransaction_studentId_idx" on public."IncomeTransaction" ("studentId");
create index "IncomeTransaction_classId_idx" on public."IncomeTransaction" ("classId");
create index "IncomeTransaction_date_idx" on public."IncomeTransaction" (date);
create index "ExpenseTransaction_date_idx" on public."ExpenseTransaction" (date);
create index "FeePayment_studentId_idx" on public."FeePayment" ("studentId");
create index "FeePayment_feeRecordId_idx" on public."FeePayment" ("feeRecordId");
create index "SalaryRecord_month_year_idx" on public."SalaryRecord" (month, year);
create index "SalaryPayment_staffId_idx" on public."SalaryPayment" ("staffId");
create index "SalaryPayment_salaryRecordId_idx" on public."SalaryPayment" ("salaryRecordId");
create index "AuditLog_userId_idx" on public."AuditLog" ("userId");
create index "AuditLog_createdAt_idx" on public."AuditLog" ("createdAt" desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'User',
    'Setting',
    'Sequence',
    'AcademicYear',
    'Program',
    'Subject',
    'Staff',
    'Class',
    'ClassSubject',
    'StaffSubject',
    'StaffAssignment',
    'Student',
    'FeeRecord',
    'IncomeTransaction',
    'ExpenseTransaction',
    'FeePayment',
    'SalaryRecord',
    'SalaryPayment',
    'AuditLog'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated, public', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

notify pgrst, 'reload schema';
