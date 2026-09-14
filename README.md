# NCCS School Management Dashboard

Modern school/college management system for students, staff, classes, and finances.

Fee status is never typed in by hand. It is calculated from expected amount, payments, and waivers, so student records, class dashboards, and finance reports stay consistent.

## Setup

```bash
npm install
npx prisma db push
npx prisma db seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@nccs.edu | Admin@123 |
| Principal | principal@nccs.edu | Principal@123 |
| Accountant / HR | accountant@nccs.edu | Accountant@123 |

## Critical workflow

1. Create a class such as **Grade 10 — ICS**.
2. Add a student and assign the class fee.
3. Record a payment (or add student-fee income).
4. The system writes the payment, creates the income transaction, recalculates fee status, and updates the class and finance dashboards from the same records.
